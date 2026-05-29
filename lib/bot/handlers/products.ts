import { InlineKeyboard } from "grammy";
import { prisma } from "../../db";
import {
  buildServiceCaption,
  CAPTION_PARSE_MODE,
} from "../channel";
import { buildEditFieldMenu } from "./edit";
import { applySold, applyRestock } from "./sold";
import { deleteProductById } from "./owner";
import type { AppContext } from "../types";

const PAGE_SIZE = 8;

/**
 * Рендерит сообщение со списком товаров (одна страница). Каждый товар —
 * inline-кнопка, по которой открывается карточка управления.
 *
 * Пагинация работает только для полного списка (без query). Поиск показывает
 * первую страницу результатов; если их больше PAGE_SIZE — подсказывает уточнить
 * (чтобы не тащить query в callback_data, который ограничен 64 байтами).
 */
async function renderProductList(
  ctx: AppContext,
  opts: { query: string; page: number; edit: boolean }
): Promise<void> {
  const { query, page, edit } = opts;

  // Поиск ищет И по названию товара (description), И по названию категории —
  // так можно «написать категорию» и увидеть товары только из неё.
  const where = query
    ? {
        OR: [
          { description: { contains: query, mode: "insensitive" as const } },
          {
            category: {
              name: { contains: query, mode: "insensitive" as const },
            },
          },
        ],
      }
    : {};

  const total = await prisma.product.count({ where });

  if (total === 0) {
    const text = query
      ? `По запросу «${query}» ничего не найдено.`
      : "Товаров пока нет. Добавь через /add_product.";
    if (edit) await ctx.editMessageText(text).catch(() => {});
    else await ctx.reply(text);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const p = Math.min(Math.max(1, page), totalPages);

  const products = await prisma.product.findMany({
    where,
    include: { category: true },
    orderBy: { createdAt: "desc" },
    skip: (p - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const kb = new InlineKeyboard();
  for (const pr of products) {
    const title = pr.description?.trim() || pr.category.name;
    const soldMark = pr.status === "SOLD" ? "❌ " : "";
    kb.text(
      `${soldMark}№${pr.id} · ${title} · ${pr.size} · ${pr.price} ₽`,
      `popen:${pr.id}`
    ).row();
  }

  // Навигация — только для полного списка (query пустой).
  if (!query && totalPages > 1) {
    if (p > 1) kb.text("◀️", `plist:${p - 1}`);
    kb.text(`${p}/${totalPages}`, "pnoop");
    if (p < totalPages) kb.text("▶️", `plist:${p + 1}`);
  }

  const header = query
    ? `Результаты по «${query}» (${total}):` +
      (total > PAGE_SIZE
        ? `\nПоказаны первые ${PAGE_SIZE}. Уточни запрос, если нужного нет.`
        : "")
    : `Товары (${total}). Стр. ${p}/${totalPages}:`;

  if (edit) {
    await ctx
      .editMessageText(header, { reply_markup: kb })
      .catch(() => {});
  } else {
    await ctx.reply(header, { reply_markup: kb });
  }
}

/**
 * /products [запрос] — листалка товаров в боте.
 * Без аргумента — все товары с пагинацией. С аргументом — поиск по названию.
 */
export async function productsCommand(ctx: AppContext): Promise<void> {
  const query =
    ctx.message?.text?.replace(/^\/products(@\w+)?\s*/, "").trim() ?? "";
  await renderProductList(ctx, { query, page: 1, edit: false });
}

/** Пагинация полного списка: plist:{page}. */
export async function onProductsPage(ctx: AppContext): Promise<void> {
  const page = Number((ctx.match as RegExpMatchArray)?.[1]) || 1;
  await ctx.answerCallbackQuery();
  await renderProductList(ctx, { query: "", page, edit: true });
}

/** Заглушка для нажатия на индикатор страницы «N/M». */
export async function onProductsNoop(ctx: AppContext): Promise<void> {
  await ctx.answerCallbackQuery();
}

/** Открыть карточку товара: popen:{id} — альбом фото + кнопки управления. */
export async function onProductOpen(ctx: AppContext): Promise<void> {
  await ctx.answerCallbackQuery();
  const id = Number((ctx.match as RegExpMatchArray)?.[1]);
  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true, photos: true },
  });
  if (!product) {
    await ctx.reply("Товар не найден (возможно, удалён).");
    return;
  }

  // Альбом фото с подписью (как в служебном чате — с категорией).
  if (product.photos.length > 0) {
    const sorted = [...product.photos].sort((a, b) => a.order - b.order);
    await ctx.replyWithMediaGroup(
      sorted.map((ph, idx) => ({
        type: "photo",
        media: ph.telegramFileId ?? ph.publicUrl,
        caption: idx === 0 ? buildServiceCaption(product) : undefined,
        parse_mode: idx === 0 ? CAPTION_PARSE_MODE : undefined,
      }))
    );
  }

  await ctx.reply(
    buildControlText(product.id, product.status),
    { reply_markup: buildControlKeyboard(product.id, product.status) }
  );
}

function buildControlText(id: number, status: "ACTIVE" | "SOLD"): string {
  return status === "SOLD"
    ? `Управление товаром №${id} (❌ ПРОДАНО):`
    : `Управление товаром №${id}:`;
}

function buildControlKeyboard(
  id: number,
  status: "ACTIVE" | "SOLD"
): InlineKeyboard {
  const kb = new InlineKeyboard().text("✏️ Редактировать", `pedit:${id}`).row();
  if (status === "ACTIVE") {
    kb.text("❌ Нет в наличии", `psold:${id}`).row();
  } else {
    kb.text("✅ Вернуть в наличие", `prestk:${id}`).row();
  }
  kb.text("🗑 Удалить", `pdel:${id}`);
  return kb;
}

/** pedit:{id} — показать меню полей редактирования прямо в ЛС. */
export async function onProductEdit(ctx: AppContext): Promise<void> {
  await ctx.answerCallbackQuery();
  const id = Number((ctx.match as RegExpMatchArray)?.[1]);
  await ctx.reply(`Что меняем в товаре №${id}?`, {
    reply_markup: buildEditFieldMenu(id),
  });
}

/** psold:{id} — пометить продано из листалки. */
export async function onProductSold(ctx: AppContext): Promise<void> {
  const id = Number((ctx.match as RegExpMatchArray)?.[1]);
  const msg = await applySold(ctx.api, id);
  await ctx.answerCallbackQuery({ text: msg });
  // Обновляем кнопки карточки на SOLD-вариант.
  await ctx
    .editMessageReplyMarkup({ reply_markup: buildControlKeyboard(id, "SOLD") })
    .catch(() => {});
  await ctx
    .editMessageText(buildControlText(id, "SOLD"), {
      reply_markup: buildControlKeyboard(id, "SOLD"),
    })
    .catch(() => {});
}

/** prestk:{id} — вернуть в наличие из листалки. */
export async function onProductRestock(ctx: AppContext): Promise<void> {
  const id = Number((ctx.match as RegExpMatchArray)?.[1]);
  const msg = await applyRestock(ctx.api, id);
  await ctx.answerCallbackQuery({ text: msg });
  await ctx
    .editMessageText(buildControlText(id, "ACTIVE"), {
      reply_markup: buildControlKeyboard(id, "ACTIVE"),
    })
    .catch(() => {});
}

/** pdel:{id} — запрос подтверждения удаления. */
export async function onProductDeletePrompt(ctx: AppContext): Promise<void> {
  await ctx.answerCallbackQuery();
  const id = Number((ctx.match as RegExpMatchArray)?.[1]);
  await ctx.reply(
    `Удалить товар №${id} безвозвратно?\n` +
      `(фото в хранилище, пост в канале и запись в БД будут стёрты)`,
    {
      reply_markup: new InlineKeyboard()
        .text("🗑 Да, удалить", `pdely:${id}`)
        .text("Отмена", "pdeln"),
    }
  );
}

/** pdely:{id} — подтверждённое удаление. */
export async function onProductDeleteConfirm(ctx: AppContext): Promise<void> {
  const id = Number((ctx.match as RegExpMatchArray)?.[1]);
  await ctx.answerCallbackQuery({ text: "Удаляю..." });
  await ctx.editMessageText(`Удаляю товар №${id}...`).catch(() => {});
  const result = await deleteProductById(ctx.api, id);
  await ctx.editMessageText(result).catch(() => {});
}

/** pdeln — отмена удаления. */
export async function onProductDeleteCancel(ctx: AppContext): Promise<void> {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Удаление отменено.").catch(() => {});
}
