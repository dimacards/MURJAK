import { InlineKeyboard, type Api } from "grammy";
import type { Category, Photo, Product } from "@prisma/client";
import { buildCaption, CAPTION_PARSE_MODE, SOLD_MARK } from "./channel";
import { prisma } from "../db";
import { isNotModifiedError } from "./telegram-utils";

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
      parse_mode: idx === 0 ? CAPTION_PARSE_MODE : undefined,
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

/**
 * Ставит «edit-lock» в служебном чате: меняет текст сообщения на
 * «✏️ Редактирует: {имя}» и убирает inline-кнопки. Возврат — через
 * restoreServiceButtons() после завершения или отмены редактирования.
 */
export async function setServiceEditLock(
  api: Api,
  product: ProductForService,
  editorName: string
): Promise<void> {
  if (!SERVICE_CHAT_ID) throw new Error("SERVICE_CHAT_ID не задан в .env");
  if (!product.serviceMessageId) return;

  await api
    .editMessageText(
      SERVICE_CHAT_ID,
      product.serviceMessageId,
      `✏️ Редактирует: ${editorName}. Закончит — кнопки вернутся.`,
      { reply_markup: { inline_keyboard: [] } } // явно убираем клавиатуру
    )
    .catch((e) => {
      if (isNotModifiedError(e)) return;
      throw e;
    });
}

/**
 * Обновляет ПОДПИСЬ под первой фотографией альбома в служебном чате
 * (та же информация, что и в канале — buildCaption).
 *
 * Вызывается при редактировании category/size/condition/price.
 * Аналогично updateChannelCaption, только для служебного чата.
 */
export async function updateServiceCaption(
  api: Api,
  product: ProductForService
): Promise<void> {
  if (!SERVICE_CHAT_ID) throw new Error("SERVICE_CHAT_ID не задан в .env");
  if (product.serviceMediaMessageIds.length === 0) return;

  await api
    .editMessageCaption(SERVICE_CHAT_ID, product.serviceMediaMessageIds[0], {
      caption: buildCaption(product),
      parse_mode: CAPTION_PARSE_MODE,
    })
    .catch((e) => {
      if (isNotModifiedError(e)) return;
      throw e;
    });
}

/**
 * Обновляет ТЕКСТ сообщения с кнопками в служебном чате (та строка
 * «Товар №X · cat · price ₽» под альбомом). Также возвращает обе кнопки.
 *
 * Если текст и клавиатура уже актуальны (например, отредактировали размер,
 * который в этом тексте не отображается) — Telegram вернёт 400
 * "message is not modified". Это нормально, игнорируем.
 */
export async function updateServiceMessage(
  api: Api,
  product: ProductForService
): Promise<void> {
  if (!SERVICE_CHAT_ID) throw new Error("SERVICE_CHAT_ID не задан в .env");
  if (!product.serviceMessageId) return;

  await api
    .editMessageText(
      SERVICE_CHAT_ID,
      product.serviceMessageId,
      buildServiceControlText(product),
      { reply_markup: buildServiceControlKeyboard(product.id) }
    )
    .catch((e) => {
      if (isNotModifiedError(e)) return;
      throw e;
    });
}

/**
 * Возвращает обе кнопки «Редактировать» / «Нет в наличии» — после отмены
 * редактирования (без изменения данных) или после возврата из SOLD.
 *
 * Семантически отличается от updateServiceMessage (данные не менялись),
 * но реализация идентичная: текст и клавиатура — оба берутся из текущего
 * состояния продукта.
 */
export async function restoreServiceButtons(
  api: Api,
  product: ProductForService
): Promise<void> {
  await updateServiceMessage(api, product);
}

/**
 * Редактирует фото в служебном альбоме «один-к-одному» через editMessageMedia.
 * Message_id-ы сохраняются. Аналог editChannelMedia для служебного чата.
 *
 * Требует совпадения количества фото с serviceMediaMessageIds.
 */
export async function editServiceMedia(
  api: Api,
  product: ProductForService,
  photos: Photo[]
): Promise<void> {
  if (!SERVICE_CHAT_ID) throw new Error("SERVICE_CHAT_ID не задан в .env");
  if (product.serviceMediaMessageIds.length === 0) return;
  if (photos.length !== product.serviceMediaMessageIds.length) {
    throw new Error(
      `editServiceMedia: количество фото (${photos.length}) не совпадает ` +
        `с количеством сообщений альбома в служебном чате ` +
        `(${product.serviceMediaMessageIds.length}). Для смены количества — ` +
        `deleteServicePost + sendToServiceChat.`
    );
  }

  const sorted = [...photos].sort((a, b) => a.order - b.order);
  const caption = buildCaption(product);

  for (let i = 0; i < sorted.length; i++) {
    const photo = sorted[i];
    const messageId = product.serviceMediaMessageIds[i];
    const isFirst = i === 0;

    await api
      .editMessageMedia(SERVICE_CHAT_ID, messageId, {
        type: "photo",
        media: photo.telegramFileId ?? photo.publicUrl,
        ...(isFirst ? { caption, parse_mode: CAPTION_PARSE_MODE } : {}),
      })
      .catch((e) => {
        if (isNotModifiedError(e)) return;
        throw e;
      });
  }
}

/**
 * Удаляет из служебного чата и альбом, и сообщение с кнопками.
 * Очищает соответствующие поля в БД (serviceMediaMessageIds и serviceMessageId).
 * Используется при смене фото — пост пересоздаётся, как и в канале.
 *
 * deleteMessage обёрнут в catch — если сообщения уже удалены вручную или
 * истёк срок удаления для не-админа (48h), это не должно валить флоу.
 */
export async function deleteServicePost(
  api: Api,
  product: ProductForService
): Promise<void> {
  if (!SERVICE_CHAT_ID) throw new Error("SERVICE_CHAT_ID не задан в .env");

  for (const id of product.serviceMediaMessageIds) {
    await api.deleteMessage(SERVICE_CHAT_ID, id).catch((e) => {
      console.warn(
        `service deleteMessage (media) failed for ${id}:`,
        e instanceof Error ? e.message : e
      );
    });
  }
  if (product.serviceMessageId !== null) {
    await api
      .deleteMessage(SERVICE_CHAT_ID, product.serviceMessageId)
      .catch((e) => {
        console.warn(
          `service deleteMessage (control) failed:`,
          e instanceof Error ? e.message : e
        );
      });
  }
  await prisma.product.update({
    where: { id: product.id },
    data: { serviceMediaMessageIds: [], serviceMessageId: null },
  });
}

/** Текст сообщения-индикатора для проданного товара. */
function buildSoldServiceText(product: ProductForService): string {
  return `${SOLD_MARK} · Товар №${product.id} · ${product.category.name} · ${product.price} ₽`;
}

/** Одна кнопка возврата в наличие. */
function buildSoldServiceKeyboard(productId: number): InlineKeyboard {
  return new InlineKeyboard().text(
    "✅ Вернуть в наличие",
    `restock:${productId}`
  );
}

/**
 * Помечает товар как продано в служебном чате: меняет текст сообщения
 * с кнопками на «❌ ПРОДАНО · ...» и оставляет одну кнопку «Вернуть в наличие».
 *
 * Альбом-сообщение в служебном чате (serviceMediaMessageIds) намеренно
 * НЕ трогается — там остаётся фото как референс.
 */
export async function markServiceAsSold(
  api: Api,
  product: ProductForService
): Promise<void> {
  if (!SERVICE_CHAT_ID) throw new Error("SERVICE_CHAT_ID не задан в .env");
  if (!product.serviceMessageId) return;

  await api
    .editMessageText(
      SERVICE_CHAT_ID,
      product.serviceMessageId,
      buildSoldServiceText(product),
      { reply_markup: buildSoldServiceKeyboard(product.id) }
    )
    .catch((e) => {
      if (isNotModifiedError(e)) return;
      throw e;
    });
}
