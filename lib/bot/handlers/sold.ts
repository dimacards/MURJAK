import type { Api } from "grammy";
import { prisma } from "../../db";
import {
  markChannelAsSold,
  republishChannelPost,
  restoreChannelFromSold,
} from "../channel";

/**
 * Переводит товар в SOLD: статус в БД + метка ❌ ПРОДАНО в канале.
 * Идемпотентно. Вызывается из листалки /products.
 *
 * Для импортированных постов (isImported=true): пост в канале не «наш»,
 * editMessageCaption запрещён Telegram'ом для чужих сообщений. Поэтому
 * для них — republishChannelPost с soldMarker=true (delete оригинала +
 * репост альбома с меткой ПРОДАНО). После repost isImported сбрасывается:
 * новые сообщения уже наши, дальнейшие операции работают «на месте».
 */
export async function applySold(api: Api, productId: number): Promise<string> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true, photos: true },
  });
  if (!product) return "Товар не найден.";
  if (product.status === "SOLD") return "Уже продано.";

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: { status: "SOLD" },
    include: { category: true, photos: true },
  });

  if (updated.isImported && updated.channelMessageIds.length > 0) {
    await republishChannelPost(api, updated, updated.photos, { sold: true });
  } else {
    await markChannelAsSold(api, updated);
  }

  return "Помечено как продано";
}

/**
 * Зеркально applySold: возврат товара в ACTIVE.
 *
 * Если SOLD был применён к импортированному товару, к этому моменту он
 * уже «наш» (republishChannelPost сбросил isImported), поэтому restore
 * через editMessageCaption работает штатно.
 */
export async function applyRestock(
  api: Api,
  productId: number
): Promise<string> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true, photos: true },
  });
  if (!product) return "Товар не найден.";
  if (product.status === "ACTIVE") return "Уже в наличии.";

  const updated = await prisma.product.update({
    where: { id: product.id },
    data: { status: "ACTIVE" },
    include: { category: true, photos: true },
  });

  if (updated.isImported && updated.channelMessageIds.length > 0) {
    // Маловероятный кейс: имп. товар стал SOLD и retreat'нулся в restock без
    // первого republish. На всякий случай — тоже republish, без soldMarker.
    await republishChannelPost(api, updated, updated.photos, { sold: false });
  } else {
    await restoreChannelFromSold(api, updated);
  }

  return "Возвращено в наличие";
}
