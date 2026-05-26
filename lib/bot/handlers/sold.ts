import { prisma } from "../../db";
import type { AppContext } from "../types";
import { markChannelAsSold, restoreChannelFromSold } from "../channel";
import { markServiceAsSold, restoreServiceButtons } from "../service-chat";

const SERVICE_CHAT_ID = process.env.SERVICE_CHAT_ID;

/**
 * Handler для клика «❌ Нет в наличии» в служебном чате.
 *
 * Доступно любому whitelisted работнику (без ownerOnly).
 * Поток:
 *  1. Проверка, что клик из служебного чата.
 *  2. Статус ACTIVE → SOLD в БД.
 *  3. markChannelAsSold — caption поста в канале дополняется «❌ ПРОДАНО».
 *  4. markServiceAsSold — сообщение с кнопками в служебном чате:
 *       текст «❌ ПРОДАНО · Товар №X · ...», одна кнопка «Вернуть в наличие».
 *  5. answerCallbackQuery.
 *
 * Идемпотентно: повторное нажатие на уже SOLD просто отвечает «Уже продано».
 */
export async function onSoldClick(ctx: AppContext): Promise<void> {
  if (String(ctx.chat?.id) !== SERVICE_CHAT_ID) {
    await ctx.answerCallbackQuery();
    return;
  }

  const productId = Number((ctx.match as RegExpMatchArray)?.[1]);
  if (!productId) {
    await ctx.answerCallbackQuery({ text: "Товар не найден.", show_alert: true });
    return;
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true },
  });
  if (!product) {
    await ctx.answerCallbackQuery({ text: "Товар не найден.", show_alert: true });
    return;
  }

  if (product.status === "SOLD") {
    await ctx.answerCallbackQuery({ text: "Уже продано." });
    return;
  }

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: { status: "SOLD" },
    include: { category: true },
  });

  // Канал и служебный чат — независимо. Если одно упадёт, статус в БД уже
  // обновлён; пользователь увидит ошибку, но retry той же кнопкой починит
  // (idempotent от Telegram-ной стороны).
  await markChannelAsSold(ctx.api, updated);
  await markServiceAsSold(ctx.api, updated);

  await ctx.answerCallbackQuery({ text: "Помечено как продано" });
}

/**
 * Handler для клика «✅ Вернуть в наличие» в служебном чате.
 * Зеркальный к onSoldClick.
 */
export async function onRestockClick(ctx: AppContext): Promise<void> {
  if (String(ctx.chat?.id) !== SERVICE_CHAT_ID) {
    await ctx.answerCallbackQuery();
    return;
  }

  const productId = Number((ctx.match as RegExpMatchArray)?.[1]);
  if (!productId) {
    await ctx.answerCallbackQuery({ text: "Товар не найден.", show_alert: true });
    return;
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true },
  });
  if (!product) {
    await ctx.answerCallbackQuery({ text: "Товар не найден.", show_alert: true });
    return;
  }

  if (product.status === "ACTIVE") {
    await ctx.answerCallbackQuery({ text: "Уже в наличии." });
    return;
  }

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: { status: "ACTIVE" },
    include: { category: true },
  });

  // Подпись в канале возвращается к обычной, в служебном чате —
  // 2 исходные кнопки и исходный текст.
  await restoreChannelFromSold(ctx.api, updated);
  await restoreServiceButtons(ctx.api, updated);

  await ctx.answerCallbackQuery({ text: "Возвращено в наличие" });
}
