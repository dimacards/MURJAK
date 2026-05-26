import { InlineKeyboard } from "grammy";
import { prisma } from "../../db";
import { supabase, SUPABASE_BUCKET } from "../../supabase";
import { deleteChannelPost } from "../channel";
import { deleteServicePost } from "../service-chat";
import type { AppContext, AppConversation } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// /add_worker — диалог: telegram_id → имя → создание Worker(WORKER).
// ─────────────────────────────────────────────────────────────────────────────

export async function addWorkerConversation(
  conversation: AppConversation,
  ctx: AppContext
): Promise<void> {
  await ctx.reply(
    "Введи telegram_id нового работника (числом).\n" +
      "Подсказка: получить можно у @userinfobot. Чтобы отменить — /cancel."
  );

  let telegramId: bigint;
  while (true) {
    const next = await conversation.waitFor("message:text");
    const text = next.message.text.trim();

    if (text === "/cancel") {
      await next.reply("Отменено.");
      return;
    }
    if (!/^\d+$/.test(text)) {
      await next.reply("Это не число. Введи telegram_id ещё раз (или /cancel):");
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

    break;
  }

  await ctx.reply("Теперь имя работника:");

  let name: string;
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

  await conversation.external(() =>
    prisma.worker.create({
      data: { telegramId, name, role: "WORKER" },
    })
  );

  await ctx.reply(
    `Работник ${name} добавлен. Не забудь добавить его в служебный чат.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// /remove_worker — inline-кнопки со всеми WORKER (без OWNER).
// ─────────────────────────────────────────────────────────────────────────────

export async function removeWorkerCommand(ctx: AppContext): Promise<void> {
  const workers = await prisma.worker.findMany({
    where: { role: "WORKER" },
    orderBy: { name: "asc" },
  });

  if (workers.length === 0) {
    await ctx.reply("Работников (кроме владельца) пока нет.");
    return;
  }

  const kb = new InlineKeyboard();
  for (const w of workers) {
    kb.text(`${w.name} (${w.telegramId})`, `rm_worker:${w.id}`).row();
  }
  kb.text("Отмена", "rm_worker:cancel");

  await ctx.reply("Кого удалить?", { reply_markup: kb });
}

export async function onRemoveWorkerCallback(ctx: AppContext): Promise<void> {
  // Регистрируется на /^rm_worker:(\d+|cancel)$/ — match[1] = id или "cancel".
  // ctx.match[1] доступен потому, что bot.callbackQuery(regex, ...) кладёт сюда матч.
  const arg = (ctx.match as RegExpMatchArray)?.[1];

  if (arg === "cancel") {
    await ctx.editMessageText("Отменено.");
    await ctx.answerCallbackQuery();
    return;
  }

  const id = Number(arg);
  const w = await prisma.worker.findUnique({ where: { id } });

  if (!w) {
    await ctx.editMessageText("Работник уже удалён.");
    await ctx.answerCallbackQuery();
    return;
  }
  if (w.role === "OWNER") {
    // Защита от случайного удаления владельца через ручной callback (наш UI его не показывает).
    await ctx.editMessageText("Нельзя удалить владельца.");
    await ctx.answerCallbackQuery();
    return;
  }

  await prisma.worker.delete({ where: { id } });
  await ctx.editMessageText(
    `Работник ${w.name} удалён. Не забудь удалить его из служебного чата.`
  );
  await ctx.answerCallbackQuery();
}

// ─────────────────────────────────────────────────────────────────────────────
// /list_workers — текстовый список.
// ─────────────────────────────────────────────────────────────────────────────

export async function listWorkersCommand(ctx: AppContext): Promise<void> {
  const workers = await prisma.worker.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }], // OWNER первым (алф. порядок enum)
  });

  if (workers.length === 0) {
    await ctx.reply("В таблице нет ни одного работника.");
    return;
  }

  const lines = workers.map(
    (w) => `${w.name} (${w.telegramId}) — ${w.role}`
  );
  await ctx.reply(lines.join("\n"));
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
// /remove_category — inline-кнопки.
// ─────────────────────────────────────────────────────────────────────────────

export async function removeCategoryCommand(ctx: AppContext): Promise<void> {
  const cats = await prisma.category.findMany({ orderBy: { name: "asc" } });

  if (cats.length === 0) {
    await ctx.reply("Категорий пока нет.");
    return;
  }

  const kb = new InlineKeyboard();
  for (const c of cats) {
    kb.text(c.name, `rm_cat:${c.id}`).row();
  }
  kb.text("Отмена", "rm_cat:cancel");

  await ctx.reply("Какую категорию удалить?", { reply_markup: kb });
}

export async function onRemoveCategoryCallback(
  ctx: AppContext
): Promise<void> {
  const arg = (ctx.match as RegExpMatchArray)?.[1];

  if (arg === "cancel") {
    await ctx.editMessageText("Отменено.");
    await ctx.answerCallbackQuery();
    return;
  }

  const id = Number(arg);
  const cat = await prisma.category.findUnique({ where: { id } });

  if (!cat) {
    await ctx.editMessageText("Категория уже удалена.");
    await ctx.answerCallbackQuery();
    return;
  }

  const productCount = await prisma.product.count({
    where: { categoryId: id },
  });
  if (productCount > 0) {
    await ctx.editMessageText(
      `Нельзя удалить, в категории «${cat.name}» ${productCount} ${pluralizeProducts(productCount)}.`
    );
    await ctx.answerCallbackQuery();
    return;
  }

  await prisma.category.delete({ where: { id } });
  await ctx.editMessageText(`Категория «${cat.name}» удалена.`);
  await ctx.answerCallbackQuery();
}

// ─────────────────────────────────────────────────────────────────────────────
// /list_categories
// ─────────────────────────────────────────────────────────────────────────────

export async function listCategoriesCommand(ctx: AppContext): Promise<void> {
  const cats = await prisma.category.findMany({ orderBy: { name: "asc" } });
  if (cats.length === 0) {
    await ctx.reply("Категорий пока нет.");
    return;
  }
  await ctx.reply(cats.map((c) => c.name).join("\n"));
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
// /delete_product <id> — полное удаление товара (БД, Supabase, канал, чат).
// ─────────────────────────────────────────────────────────────────────────────
//
// Используется в основном для уборки «осиротевших» товаров — тех, что были
// созданы до Этапа 6 (когда добавился служебный чат) и не имеют
// serviceMessageId, поэтому нет кнопки «❌ Нет в наличии».
//
// В отличие от SOLD-флоу (просто прячет с сайта, оставляет в канале),
// эта команда удаляет товар БЕЗВОЗВРАТНО.
export async function deleteProductCommand(ctx: AppContext): Promise<void> {
  const arg = ctx.message?.text?.split(/\s+/)[1];
  const id = Number(arg);
  if (!arg || !Number.isInteger(id) || id < 1) {
    await ctx.reply(
      "Использование: /delete_product <id>\n" +
        "Пример: /delete_product 7\n\n" +
        "Узнать id товара можно через /api/products или Prisma Studio."
    );
    return;
  }

  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true, photos: true },
  });
  if (!product) {
    await ctx.reply(`Товар №${id} не найден.`);
    return;
  }

  const progress = await ctx.reply(
    `Удаляю товар №${id} (${product.category.name}, ${product.price} ₽)...`
  );
  const chatId = progress.chat.id;
  const progressId = progress.message_id;
  const updateProgress = async (text: string) => {
    await ctx.api.editMessageText(chatId, progressId, text).catch(() => {});
  };

  // 1. Сообщения в канале — best effort.
  if (product.channelMessageIds.length > 0) {
    await updateProgress(`Удаляю пост в канале...`);
    try {
      await deleteChannelPost(ctx.api, product);
    } catch (e) {
      console.warn("deleteChannelPost in /delete_product:", e);
    }
  }

  // 2. Сообщения в служебном чате — best effort.
  if (
    product.serviceMessageId !== null ||
    product.serviceMediaMessageIds.length > 0
  ) {
    await updateProgress(`Удаляю в служебном чате...`);
    try {
      await deleteServicePost(ctx.api, product);
    } catch (e) {
      console.warn("deleteServicePost in /delete_product:", e);
    }
  }

  // 3. Файлы в Supabase Storage — best effort.
  if (product.photos.length > 0) {
    await updateProgress(`Удаляю фото из хранилища...`);
    const paths = product.photos.map((p) => p.storagePath);
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .remove(paths);
    if (error) {
      console.warn("supabase remove in /delete_product:", error);
    }
  }

  // 4. БД — Photo каскадно удаляются по foreign key onDelete: Cascade.
  await prisma.product.delete({ where: { id } });

  await updateProgress(
    `✅ Товар №${id} удалён полностью (БД, Supabase, канал, служебный чат).`
  );
}
