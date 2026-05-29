import { InlineKeyboard, Keyboard } from "grammy";
import { prisma } from "../../db";
import { supabase, SUPABASE_BUCKET } from "../../supabase";
import { deleteChannelPost } from "../channel";
import { deleteServicePost } from "../service-chat";
import type { AppContext, AppConversation } from "../types";

// request_id для кнопки RequestUsers в /add_worker — нужен для матчинга
// shared-users-ответа с нашим запросом.
const ADD_WORKER_REQUEST_ID = 1;

// ─────────────────────────────────────────────────────────────────────────────
// /add_worker — диалог: telegram_id → имя → создание Worker(WORKER).
// ─────────────────────────────────────────────────────────────────────────────

export async function addWorkerConversation(
  conversation: AppConversation,
  ctx: AppContext
): Promise<void> {
  // Reply-keyboard с системной кнопкой «Поделиться контактом» (RequestUsers).
  // При нажатии Telegram открывает picker контактов → выбранный user шарится
  // в виде message.users_shared с user_id и first_name (request_name: true).
  // Альтернативно работник вводит telegram_id числом — fallback для тех, кому
  // RequestUsers не подходит (например, добавляемый ещё не контакт).
  const shareKb = new Keyboard()
    .requestUsers("📱 Поделиться контактом", ADD_WORKER_REQUEST_ID, {
      user_is_bot: false,
      request_name: true,
      max_quantity: 1,
    })
    .resized()
    .oneTime();

  await ctx.reply(
    "Кого добавить работником?\n\n" +
      "• Нажми «📱 Поделиться контактом» и выбери его в списке контактов.\n" +
      "• Или введи Telegram ID числом (получить можно у @userinfobot).\n" +
      "• Чтобы отменить — /cancel.",
    { reply_markup: shareKb }
  );

  let telegramId: bigint;
  // sharedName заполняется только если работник пришёл через RequestUsers —
  // тогда пропускаем ручной ввод имени и сразу используем имя из Telegram.
  let sharedName: string | undefined = undefined;

  pickWorker: while (true) {
    const next = await conversation.wait();

    // ── Поделиться контактом ──────────────────────────────────────────────
    if (next.message?.users_shared) {
      const shared = next.message.users_shared;
      if (shared.request_id !== ADD_WORKER_REQUEST_ID) {
        await next.reply("Неожиданный share — попробуй ещё раз или /cancel.");
        continue;
      }
      const u = shared.users[0];
      if (!u) {
        await next.reply("Никого не выбрал — попробуй ещё раз или /cancel.");
        continue;
      }
      telegramId = BigInt(u.user_id);
      const combinedName = [u.first_name, u.last_name]
        .filter((x): x is string => !!x && x.trim().length > 0)
        .join(" ")
        .trim();
      sharedName = combinedName.length > 0 ? combinedName : undefined;

      const existing = await conversation.external(() =>
        prisma.worker.findUnique({ where: { telegramId } })
      );
      if (existing) {
        await next.reply(
          `Этот пользователь уже работник: «${existing.name}» (роль ${existing.role}).`,
          { reply_markup: { remove_keyboard: true } }
        );
        return;
      }
      break pickWorker;
    }

    // ── Текстовый fallback ────────────────────────────────────────────────
    if (next.message?.text) {
      const text = next.message.text.trim();
      if (text === "/cancel") {
        await next.reply("Отменено.", {
          reply_markup: { remove_keyboard: true },
        });
        return;
      }
      if (!/^\d+$/.test(text)) {
        await next.reply(
          "Это не число и не контакт. Нажми кнопку «📱 Поделиться контактом» или введи Telegram ID числом (или /cancel):"
        );
        continue;
      }
      telegramId = BigInt(text);
      const existing = await conversation.external(() =>
        prisma.worker.findUnique({ where: { telegramId } })
      );
      if (existing) {
        await next.reply(
          `Этот telegram_id уже есть у работника «${existing.name}» (${existing.role}). Введи другой или /cancel:`
        );
        continue;
      }
      break pickWorker;
    }

    // что-то ещё (фото, стикер) — игнорим
  }

  // ── Имя ────────────────────────────────────────────────────────────────
  // Из контакта берём имя автоматически. Для ручного ID — спрашиваем имя.
  let name: string;
  if (sharedName) {
    name = sharedName;
  } else {
    await ctx.reply("Имя работника:", {
      reply_markup: { remove_keyboard: true },
    });
    while (true) {
      const next = await conversation.waitFor("message:text");
      const t = next.message.text.trim();
      if (t === "/cancel") {
        await next.reply("Отменено.");
        return;
      }
      if (!t) {
        await next.reply("Пустое имя. Введи ещё раз (или /cancel):");
        continue;
      }
      name = t;
      break;
    }
  }

  // ── Подтверждение ────────────────────────────────────────────────────────
  await ctx.reply(`Добавить работника «${name}» (id ${telegramId})?`, {
    reply_markup: new InlineKeyboard()
      .text("✅ Добавить", "aw_confirm")
      .text("❌ Отмена", "aw_cancel"),
  });

  const confirm = await conversation.waitForCallbackQuery(
    /^aw_(confirm|cancel)$/
  );
  await confirm.answerCallbackQuery();
  await confirm.editMessageReplyMarkup().catch(() => {});

  if (confirm.callbackQuery.data === "aw_cancel") {
    await ctx.reply("Отменено.");
    return;
  }

  await conversation.external(() =>
    prisma.worker.create({
      data: { telegramId, name, role: "WORKER" },
    })
  );

  await ctx.reply(`✅ Работник «${name}» добавлен.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// /workers — единый интерфейс управления работниками.
//   Список (кнопки) + «➕ Добавить работника».
//   Клик по работнику → карточка с «🗑 Удалить» / «↩️ Назад».
// ─────────────────────────────────────────────────────────────────────────────

async function renderWorkersList(
  ctx: AppContext,
  edit: boolean
): Promise<void> {
  const workers = await prisma.worker.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }], // OWNER первым
  });

  const kb = new InlineKeyboard();
  for (const w of workers) {
    const roleLabel = w.role === "OWNER" ? "👑" : "👤";
    kb.text(`${roleLabel} ${w.name}`, `w_open:${w.id}`).row();
  }
  kb.text("➕ Добавить работника", "w_add");

  const text =
    workers.length > 0
      ? "Работники. Нажми на работника, чтобы удалить:"
      : "Работников пока нет.";

  if (edit) {
    await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }
}

export async function workersCommand(ctx: AppContext): Promise<void> {
  await renderWorkersList(ctx, false);
}

/** w_open:{id} — карточка работника с кнопками удаления/назад. */
export async function onWorkerOpen(ctx: AppContext): Promise<void> {
  const id = Number((ctx.match as RegExpMatchArray)?.[1]);
  const w = await prisma.worker.findUnique({ where: { id } });
  await ctx.answerCallbackQuery();
  if (!w) {
    await renderWorkersList(ctx, true);
    return;
  }
  const kb = new InlineKeyboard();
  if (w.role !== "OWNER") kb.text("🗑 Удалить", `w_del:${w.id}`);
  kb.text("↩️ Назад", "w_back");

  const ownerNote = w.role === "OWNER" ? "\n\nВладельца удалить нельзя." : "";
  await ctx
    .editMessageText(
      `${w.name} (${w.telegramId}) — ${w.role}${ownerNote}`,
      { reply_markup: kb }
    )
    .catch(() => {});
}

/** w_del:{id} — удалить работника, вернуться к списку. */
export async function onWorkerDelete(ctx: AppContext): Promise<void> {
  const id = Number((ctx.match as RegExpMatchArray)?.[1]);
  const w = await prisma.worker.findUnique({ where: { id } });
  if (w && w.role === "OWNER") {
    await ctx.answerCallbackQuery({
      text: "Нельзя удалить владельца.",
      show_alert: true,
    });
    return;
  }
  if (w) await prisma.worker.delete({ where: { id } });
  await ctx.answerCallbackQuery({ text: w ? `Удалён: ${w.name}` : "Уже удалён" });
  await renderWorkersList(ctx, true);
}

/** w_back — вернуться к списку работников. */
export async function onWorkerBack(ctx: AppContext): Promise<void> {
  await ctx.answerCallbackQuery();
  await renderWorkersList(ctx, true);
}

/** w_add — запустить диалог добавления работника. */
export async function onWorkerAdd(ctx: AppContext): Promise<void> {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("addWorkerConversation");
}

// ─────────────────────────────────────────────────────────────────────────────
// /add_category — диалог: название → создание Category.
// ─────────────────────────────────────────────────────────────────────────────

export async function addCategoryConversation(
  conversation: AppConversation,
  ctx: AppContext
): Promise<void> {
  await ctx.reply("Введи название новой категории (или /cancel):");

  while (true) {
    const next = await conversation.waitFor("message:text");
    const name = next.message.text.trim();

    if (name === "/cancel") {
      await next.reply("Отменено.");
      return;
    }
    if (!name) {
      await next.reply("Пустое название. Введи ещё раз (или /cancel):");
      continue;
    }

    const existing = await conversation.external(() =>
      prisma.category.findUnique({ where: { name } })
    );
    if (existing) {
      await next.reply(
        `Категория «${name}» уже есть. Введи другое название (или /cancel):`
      );
      continue;
    }

    await conversation.external(() =>
      prisma.category.create({ data: { name } })
    );
    await next.reply(`Категория «${name}» добавлена.`);
    return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// /categories — единый интерфейс управления категориями.
//   Список (кнопки, со счётчиком товаров) + «➕ Добавить категорию».
//   Клик по категории → карточка с «🗑 Удалить» / «↩️ Назад».
//   Удаление блокируется, если в категории есть товары.
// ─────────────────────────────────────────────────────────────────────────────

async function renderCategoriesList(
  ctx: AppContext,
  edit: boolean
): Promise<void> {
  const cats = await prisma.category.findMany({ orderBy: { name: "asc" } });

  const kb = new InlineKeyboard();
  if (cats.length > 0) {
    const counts = await prisma.product.groupBy({
      by: ["categoryId"],
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    for (const c of cats) {
      const n = countMap.get(c.id) ?? 0;
      kb.text(`${c.name}${n > 0 ? ` (${n})` : ""}`, `c_open:${c.id}`).row();
    }
  }
  kb.text("➕ Добавить категорию", "c_add");

  const text =
    cats.length > 0
      ? "Категории. Нажми на категорию, чтобы удалить (в скобках — число товаров):"
      : "Категорий пока нет.";

  if (edit) {
    await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }
}

export async function categoriesCommand(ctx: AppContext): Promise<void> {
  await renderCategoriesList(ctx, false);
}

/** c_open:{id} — карточка категории с удалением/назад. */
export async function onCategoryOpen(ctx: AppContext): Promise<void> {
  const id = Number((ctx.match as RegExpMatchArray)?.[1]);
  const cat = await prisma.category.findUnique({ where: { id } });
  await ctx.answerCallbackQuery();
  if (!cat) {
    await renderCategoriesList(ctx, true);
    return;
  }
  const productCount = await prisma.product.count({
    where: { categoryId: id },
  });
  const kb = new InlineKeyboard();
  kb.text("🗑 Удалить", `c_del:${cat.id}`);
  kb.text("↩️ Назад", "c_back");

  const note =
    productCount > 0
      ? `\n\nВ категории ${productCount} ${pluralizeProducts(productCount)} — удалить нельзя, пока они есть.`
      : "";
  await ctx
    .editMessageText(`Категория «${cat.name}»${note}`, { reply_markup: kb })
    .catch(() => {});
}

/** c_del:{id} — удалить пустую категорию, вернуться к списку. */
export async function onCategoryDelete(ctx: AppContext): Promise<void> {
  const id = Number((ctx.match as RegExpMatchArray)?.[1]);
  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat) {
    await ctx.answerCallbackQuery({ text: "Уже удалена." });
    await renderCategoriesList(ctx, true);
    return;
  }
  const productCount = await prisma.product.count({
    where: { categoryId: id },
  });
  if (productCount > 0) {
    await ctx.answerCallbackQuery({
      text: `Нельзя: в «${cat.name}» ${productCount} ${pluralizeProducts(productCount)}.`,
      show_alert: true,
    });
    return;
  }
  await prisma.category.delete({ where: { id } });
  await ctx.answerCallbackQuery({ text: `Удалена: ${cat.name}` });
  await renderCategoriesList(ctx, true);
}

/** c_back — вернуться к списку категорий. */
export async function onCategoryBack(ctx: AppContext): Promise<void> {
  await ctx.answerCallbackQuery();
  await renderCategoriesList(ctx, true);
}

/** c_add — запустить диалог добавления категории. */
export async function onCategoryAdd(ctx: AppContext): Promise<void> {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter("addCategoryConversation");
}

// ─────────────────────────────────────────────────────────────────────────────

function pluralizeProducts(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "товаров";
  const last = n % 10;
  if (last === 1) return "товар";
  if (last >= 2 && last <= 4) return "товара";
  return "товаров";
}

// ─────────────────────────────────────────────────────────────────────────────
// Полное удаление товара. Команда /delete_product убрана — удаление теперь
// через /products → карточка товара → «🗑 Удалить». Здесь только переиспользуемая
// функция deleteProductById (вызывается из handlers/products.ts).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Полностью удаляет товар: пост в канале, сообщения в служебном чате, файлы
 * в Supabase Storage и запись в БД (Photo каскадно). Best-effort по внешним
 * системам — если какое-то удаление упадёт, продолжаем (товар всё равно
 * исчезнет из БД). Возвращает текст результата.
 *
 * Вынесено, чтобы вызывать и из /delete_product, и из листалки /products.
 */
export async function deleteProductById(
  api: AppContext["api"],
  id: number
): Promise<string> {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true, photos: true },
  });
  if (!product) return `Товар №${id} не найден.`;

  // 1. Канал.
  if (product.channelMessageIds.length > 0) {
    try {
      await deleteChannelPost(api, product);
    } catch (e) {
      console.warn("deleteChannelPost in deleteProductById:", e);
    }
  }
  // 2. Служебный чат.
  if (
    product.serviceMessageId !== null ||
    product.serviceMediaMessageIds.length > 0
  ) {
    try {
      await deleteServicePost(api, product);
    } catch (e) {
      console.warn("deleteServicePost in deleteProductById:", e);
    }
  }
  // 3. Supabase Storage.
  if (product.photos.length > 0) {
    const paths = product.photos.map((p) => p.storagePath);
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .remove(paths);
    if (error) console.warn("supabase remove in deleteProductById:", error);
  }
  // 4. БД.
  await prisma.product.delete({ where: { id: product.id } });

  return `✅ Товар №${product.id} удалён полностью.`;
}
