import type { Api } from "grammy";
import { prisma } from "../../db";
import type { AppContext } from "../types";
import { markChannelAsSold, restoreChannelFromSold } from "../channel";
import { markServiceAsSold, restoreServiceButtons } from "../service-chat";

const SERVICE_CHAT_ID = process.env.SERVICE_CHAT_ID;

/**
 * Переводит товар в SOLD: статус в БД + метка в канале + обновление
 * сообщения в служебном чате (если оно есть). Возвращает текст для toast.
 *
 * Идемпотентно. Вызывается и из служебного чата (onSoldClick), и из
 * листалки /products в ЛС (onProductSold).
 */
export async function applySold(api: Api, productId: number): Promise<string> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true },
  });
  if (!product) return "Товар не найден.";
  if (product.status === "SOLD") return "Уже продано.";

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: { status: "SOLD" },
    include: { category: true },
  });

  // markServiceAsSold сам пропускает, если serviceMessageId == null
  // (служебного чата нет / товар туда не постился).
  await markChannelAsSold(api, updated);
  await markServiceAsSold(api, updated);

  return "Помечено как продано";
}

/**
 * Зеркально applySold: возврат товара в ACTIVE.
 */
export async function applyRestock(
  api: Api,
  productId: number
): Promise<string> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true },
  });
  if (!product) return "Товар не найден.";
  if (product.status === "ACTIVE") return "Уже в наличии.";

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: { status: "ACTIVE" },
    include: { category: true },
  });

  await restoreChannelFromSold(api, updated);
  await restoreServiceButtons(api, updated);

  return "Возвращено в наличие";
}

/**
 * Handler для клика «❌ Нет в наличии» в служебном чате.
 * Доступно любому whitelisted работнику.
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
  const msg = await applySold(ctx.api, productId);
  await ctx.answerCallbackQuery({ text: msg });
}

/**
 * Handler для клика «✅ Вернуть в наличие» в служебном чате.
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
  const msg = await applyRestock(ctx.api, productId);
  await ctx.answerCallbackQuery({ text: msg });
}
