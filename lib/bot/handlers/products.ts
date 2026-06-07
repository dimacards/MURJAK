import { InlineKeyboard } from "grammy";
import type { AppContext } from "../types";
import { prisma } from "../../db";
import config from "../../config";
import { supabase, SUPABASE_BUCKET } from "../../supabase";

const LIST_LIMIT = 100;
const BTN_NAME_MAX = 40; // обрезаем длинные названия в кнопке списка

/**
 * /products — показать список товаров. У каждого — кнопка с названием и ценой,
 * клик открывает меню товара. Без пагинации (у бренда товаров мало).
 */
export async function productsCommand(ctx: AppContext): Promise<void> {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });

  if (products.length === 0) {
    await ctx.reply("Пока нет товаров. Добавь через /add_product.");
    return;
  }

  const kb = new InlineKeyboard();
  for (const p of products) {
    const prefix = p.inStock ? "" : "🚫 ";
    const name = truncate(p.name, BTN_NAME_MAX);
    kb.text(`${prefix}${name} — ${p.price} ${config.currency}`, `pr:open:${p.id}`).row();
  }

  await ctx.reply(`Товары (${products.length}):`, { reply_markup: kb });
}

/** Возврат к списку из меню товара. */
export async function onProductsList(ctx: AppContext): Promise<void> {
  await ctx.answerCallbackQuery();
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
  });
  const kb = new InlineKeyboard();
  for (const p of products) {
    const prefix = p.inStock ? "" : "🚫 ";
    const name = truncate(p.name, BTN_NAME_MAX);
    kb.text(`${prefix}${name} — ${p.price} ${config.currency}`, `pr:open:${p.id}`).row();
  }
  const text =
    products.length === 0
      ? "Пока нет товаров. Добавь через /add_product."
      : `Товары (${products.length}):`;
  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
}

/** Открыть меню товара (по клику на товар в списке). */
export async function onProductOpen(ctx: AppContext): Promise<void> {
  const match = ctx.match as RegExpMatchArray | undefined;
  const id = Number(match?.[1]);
  await ctx.answerCallbackQuery();
  await renderProductMenu(ctx, id, "edit");
}

/** Переключить наличие. */
export async function onProductToggleStock(ctx: AppContext): Promise<void> {
  const match = ctx.match as RegExpMatchArray | undefined;
  const id = Number(match?.[1]);
  const p = await prisma.product.findUnique({
    where: { id },
    select: { inStock: true },
  });
  if (!p) {
    await ctx.answerCallbackQuery({ text: "Товар не найден", show_alert: true });
    return;
  }
  await prisma.product.update({
    where: { id },
    data: { inStock: !p.inStock },
  });
  await ctx.answerCallbackQuery({
    text: !p.inStock ? "В наличии" : "Нет в наличии",
  });
  await renderProductMenu(ctx, id, "edit");
}

/** Запрос подтверждения удаления. */
export async function onProductDelPrompt(ctx: AppContext): Promise<void> {
  const match = ctx.match as RegExpMatchArray | undefined;
  const id = Number(match?.[1]);
  const kb = new InlineKeyboard()
    .text("✅ Да, удалить", `pr:delyes:${id}`)
    .text("⬅ Назад", `pr:open:${id}`);
  await ctx.editMessageText(
    `Точно удалить товар #${id}? Это необратимо — фото тоже сотрутся.`,
    { reply_markup: kb },
  ).catch(() => {});
  await ctx.answerCallbackQuery();
}

/** Удалить товар: фото из Storage + каскадно из БД (Photo, Feature). */
export async function onProductDelConfirm(ctx: AppContext): Promise<void> {
  const match = ctx.match as RegExpMatchArray | undefined;
  const id = Number(match?.[1]);

  const photos = await prisma.photo.findMany({
    where: { productId: id },
    select: { storagePath: true },
  });
  if (photos.length > 0) {
    const paths = photos.map((p) => p.storagePath);
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .remove(paths);
    if (error) {
      console.warn("[pr:delyes] supabase remove warning:", error.message);
    }
  }

  try {
    await prisma.product.delete({ where: { id } });
  } catch (e) {
    console.error("[pr:delyes] DB delete failed:", e);
    await ctx.answerCallbackQuery({
      text: "Не получилось удалить",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Удалено" });
  await ctx.editMessageText(`Товар #${id} удалён.`).catch(() => {});
}

/** Открыть подменю особенностей. */
export async function onProductEditFeatures(ctx: AppContext): Promise<void> {
  const match = ctx.match as RegExpMatchArray | undefined;
  const id = Number(match?.[1]);
  await ctx.answerCallbackQuery();
  await renderFeaturesMenu(ctx, id);
}

/** Удалить одну особенность из подменю. */
export async function onFeatureDelete(ctx: AppContext): Promise<void> {
  const match = ctx.match as RegExpMatchArray | undefined;
  const featureId = Number(match?.[1]);
  const feat = await prisma.feature.findUnique({
    where: { id: featureId },
    select: { productId: true },
  });
  if (!feat) {
    await ctx.answerCallbackQuery({ text: "Уже удалено" });
    return;
  }
  await prisma.feature.delete({ where: { id: featureId } });
  await ctx.answerCallbackQuery({ text: "Удалено" });
  await renderFeaturesMenu(ctx, feat.productId);
}

// ── Рендеры (общие для send/edit) ────────────────────────────────────────────

/**
 * Меню товара. Используется и при первом открытии (edit callback-message),
 * и после edit-conversation (отправляется новым сообщением — `mode='send'`).
 */
export async function renderProductMenu(
  ctx: AppContext,
  id: number,
  mode: "send" | "edit",
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      photos: { select: { id: true } },
      features: { select: { id: true } },
    },
  });

  if (!product) {
    const text = `Товар #${id} не найден.`;
    if (mode === "edit") {
      await ctx.editMessageText(text).catch(() => {});
    } else {
      await ctx.reply(text);
    }
    return;
  }

  const lines = [
    `#${product.id}: ${product.name}`,
    `Цена: ${product.price} ${config.currency}`,
    `Наличие: ${product.inStock ? "✅ в наличии" : "⛔ нет в наличии"}`,
    `Фото: ${product.photos.length}, особенностей: ${product.features.length}`,
  ];
  const text = lines.join("\n");

  const kb = new InlineKeyboard()
    .text("📝 Название", `pr:editname:${id}`)
    .text("💰 Цена", `pr:editprice:${id}`)
    .row()
    .text("🖼 Фото (перезагрузить все)", `pr:editphotos:${id}`)
    .row()
    .text("⭐ Особенности", `pr:fmenu:${id}`)
    .row()
    .text(
      product.inStock ? "⛔ Пометить «нет в наличии»" : "✅ Вернуть в наличие",
      `pr:togstk:${id}`,
    )
    .row()
    .text("🗑 Удалить товар", `pr:delpr:${id}`)
    .row()
    .text("⬅ К списку", "pr:list");

  if (mode === "edit") {
    await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
  } else {
    await ctx.reply(text, { reply_markup: kb });
  }
}

/** Подменю особенностей: список с ✕ + «Добавить» + «Назад». */
async function renderFeaturesMenu(
  ctx: AppContext,
  productId: number,
): Promise<void> {
  const features = await prisma.feature.findMany({
    where: { productId },
    orderBy: { order: "asc" },
  });

  const headerLines = [`Особенности товара #${productId}:`];
  if (features.length === 0) {
    headerLines.push("(пока ни одной)");
  } else {
    headerLines.push(
      ...features.map((f, i) => `${i + 1}. ${f.text}`),
    );
  }
  const text = headerLines.join("\n");

  const kb = new InlineKeyboard();
  for (const f of features) {
    kb.text(`✕ ${truncate(f.text, 50)}`, `pr:fdel:${f.id}`).row();
  }
  kb.text("➕ Добавить", `pr:fadd:${productId}`).row();
  kb.text("⬅ К меню товара", `pr:open:${productId}`);

  await ctx.editMessageText(text, { reply_markup: kb }).catch(() => {});
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
