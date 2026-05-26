import type { Api } from "grammy";
import type { Category, Photo, Product } from "@prisma/client";

const CHANNEL_ID = process.env.CHANNEL_ID;

/**
 * Тип товара для операций с каналом — должен содержать category-relation,
 * чтобы можно было сформировать подпись.
 */
export type ProductForChannel = Product & { category: Category };

/**
 * Формирует подпись поста товара.
 * Формат:
 *   {категория}
 *   Размер: {size}
 *   Состояние: {condition}/10
 *   Цена: {price} ₽
 */
export function buildCaption(product: ProductForChannel): string {
  return [
    product.category.name,
    `Размер: ${product.size}`,
    `Состояние: ${product.condition}/10`,
    `Цена: ${product.price} ₽`,
  ].join("\n");
}

/**
 * Публикует товар альбомом в канал.
 *
 * - Подпись только на первом фото (Telegram media group поддерживает caption
 *   только на одном элементе).
 * - В качестве media используется `telegramFileId` если он сохранён — Telegram
 *   кэширует загруженные файлы и не качает их заново. Fallback — `publicUrl`
 *   из Supabase Storage.
 *
 * Возвращает массив message_id всех сообщений альбома (1..10 шт) — нужен для
 * последующих операций editCaption / delete / SOLD.
 */
export async function publishToChannel(
  api: Api,
  product: ProductForChannel,
  photos: Photo[]
): Promise<number[]> {
  if (!CHANNEL_ID) throw new Error("CHANNEL_ID не задан в .env");
  if (photos.length === 0) throw new Error("Нет фото для публикации");

  const caption = buildCaption(product);
  const sorted = [...photos].sort((a, b) => a.order - b.order);

  const messages = await api.sendMediaGroup(
    CHANNEL_ID,
    sorted.map((photo, idx) => ({
      type: "photo",
      media: photo.telegramFileId ?? photo.publicUrl,
      caption: idx === 0 ? caption : undefined,
    }))
  );

  return messages.map((m) => m.message_id);
}

// ─── Заглушки для последующих этапов ──────────────────────────────────────────

/**
 * Редактирует подпись первого сообщения альбома в канале — нужно при
 * редактировании категории/размера/состояния/цены товара (фото не меняются).
 *
 * TODO Этап 7: реализовать через
 *   api.editMessageCaption(CHANNEL_ID, product.channelMessageIds[0],
 *     { caption: buildCaption(product) })
 */
export async function updateChannelCaption(
  _api: Api,
  _product: ProductForChannel
): Promise<void> {
  throw new Error("TODO updateChannelCaption — будет реализовано на Этапе 7");
}

/**
 * Удаляет все сообщения альбома из канала. Используется при смене фото:
 * Telegram не разрешает редактировать медиа в опубликованном альбоме, поэтому
 * старый пост удаляется и публикуется заново.
 *
 * TODO Этап 7: цикл по product.channelMessageIds с api.deleteMessage.
 */
export async function deleteChannelPost(
  _api: Api,
  _product: ProductForChannel
): Promise<void> {
  throw new Error("TODO deleteChannelPost — будет реализовано на Этапе 7");
}

/**
 * Помечает товар в канале как «❌ ПРОДАНО» — дописывает строку в подпись.
 *
 * TODO Этап 8: api.editMessageCaption первого сообщения, новый caption =
 * buildCaption(product) + "\n❌ ПРОДАНО".
 */
export async function markChannelAsSold(
  _api: Api,
  _product: ProductForChannel
): Promise<void> {
  throw new Error("TODO markChannelAsSold — будет реализовано на Этапе 8");
}

/**
 * Возвращает товар в продажу: убирает «❌ ПРОДАНО» из подписи.
 *
 * TODO Этап 8: api.editMessageCaption первого сообщения, восстановить
 * чистый buildCaption(product).
 */
export async function restoreChannelFromSold(
  _api: Api,
  _product: ProductForChannel
): Promise<void> {
  throw new Error("TODO restoreChannelFromSold — будет реализовано на Этапе 8");
}
