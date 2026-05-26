import { InlineKeyboard, type Api } from "grammy";
import type { Category, Photo, Product } from "@prisma/client";
import { buildCaption } from "./channel";

const SERVICE_CHAT_ID = process.env.SERVICE_CHAT_ID;

/**
 * Тип товара для операций со служебным чатом — нужна category-relation
 * для подписи и для короткого ID-текста рядом с кнопками.
 */
export type ProductForService = Product & { category: Category };

/**
 * Короткий идентификатор товара для сообщения с кнопками в служебном чате.
 * Нужен, чтобы при пролистывании было понятно, к какому товару относятся
 * кнопки «Редактировать» / «Нет в наличии».
 */
export function buildServiceControlText(product: ProductForService): string {
  return `Товар №${product.id} · ${product.category.name} · ${product.price} ₽`;
}

/**
 * Стандартные две кнопки управления товаром в служебном чате.
 */
export function buildServiceControlKeyboard(productId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("✏️ Редактировать", `edit:${productId}`)
    .text("❌ Нет в наличии", `sold:${productId}`);
}

/**
 * Отправляет в служебный чат:
 *   1. Альбом фото с подписью (та же, что в канале).
 *   2. Отдельное сообщение с короткой строкой «Товар №X · cat · price ₽»
 *      и двумя inline-кнопками.
 *
 * Inline-кнопки нельзя прицепить к media group, поэтому делаем отдельным
 * сообщением сразу после альбома.
 *
 * Возвращает оба набора message_id — нужны для последующих операций
 * редактирования/SOLD/удаления.
 */
export async function sendToServiceChat(
  api: Api,
  product: ProductForService,
  photos: Photo[]
): Promise<{ mediaMessageIds: number[]; controlMessageId: number }> {
  if (!SERVICE_CHAT_ID) throw new Error("SERVICE_CHAT_ID не задан в .env");
  if (photos.length === 0) {
    throw new Error("Нет фото для отправки в служебный чат");
  }

  const caption = buildCaption(product);
  const sorted = [...photos].sort((a, b) => a.order - b.order);

  // 1. Альбом
  const mediaMessages = await api.sendMediaGroup(
    SERVICE_CHAT_ID,
    sorted.map((photo, idx) => ({
      type: "photo",
      media: photo.telegramFileId ?? photo.publicUrl,
      caption: idx === 0 ? caption : undefined,
    }))
  );

  // 2. Сообщение с кнопками
  const controlMsg = await api.sendMessage(
    SERVICE_CHAT_ID,
    buildServiceControlText(product),
    { reply_markup: buildServiceControlKeyboard(product.id) }
  );

  return {
    mediaMessageIds: mediaMessages.map((m) => m.message_id),
    controlMessageId: controlMsg.message_id,
  };
}

// ─── Заглушки для последующих этапов ──────────────────────────────────────────

/**
 * Обновляет текст сообщения с кнопками в служебном чате
 * (например при смене категории или цены — они отображаются в строке-идентификаторе).
 *
 * TODO Этап 7: api.editMessageText(SERVICE_CHAT_ID, product.serviceMessageId,
 *   buildServiceControlText(product), { reply_markup: buildServiceControlKeyboard(product.id) }).
 */
export async function updateServiceMessage(
  _api: Api,
  _product: ProductForService
): Promise<void> {
  throw new Error("TODO updateServiceMessage — будет на Этапе 7");
}

/**
 * Удаляет из служебного чата и альбом, и сообщение с кнопками.
 * Используется при смене фото — пост пересоздаётся, как и в канале.
 *
 * TODO Этап 7: цикл api.deleteMessage по product.serviceMediaMessageIds +
 * api.deleteMessage(SERVICE_CHAT_ID, product.serviceMessageId).
 */
export async function deleteServicePost(
  _api: Api,
  _product: ProductForService
): Promise<void> {
  throw new Error("TODO deleteServicePost — будет на Этапе 7");
}

/**
 * Возвращает обе кнопки «Редактировать» / «Нет в наличии» —
 * после возврата товара из SOLD в ACTIVE.
 *
 * TODO Этап 8: api.editMessageReplyMarkup или editMessageText с
 * buildServiceControlKeyboard.
 */
export async function restoreServiceButtons(
  _api: Api,
  _product: ProductForService
): Promise<void> {
  throw new Error("TODO restoreServiceButtons — будет на Этапе 8");
}

/**
 * Меняет кнопки на одну «Вернуть в наличие» (callback: `restore:{id}`)
 * + добавляет «(ПРОДАНО)» к тексту сообщения с кнопками.
 *
 * TODO Этап 8: api.editMessageText с новой клавиатурой:
 *   new InlineKeyboard().text("✅ Вернуть в наличие", `restore:${id}`).
 */
export async function markServiceAsSold(
  _api: Api,
  _product: ProductForService
): Promise<void> {
  throw new Error("TODO markServiceAsSold — будет на Этапе 8");
}
