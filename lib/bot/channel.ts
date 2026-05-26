import type { Api } from "grammy";
import type { Category, Photo, Product } from "@prisma/client";
import { prisma } from "../db";
import config from "../config";
import { isNotModifiedError } from "./telegram-utils";

const CHANNEL_ID = process.env.CHANNEL_ID;

/**
 * Тип товара для операций с каналом — должен содержать category-relation,
 * чтобы можно было сформировать подпись.
 */
export type ProductForChannel = Product & { category: Category };

/** Все подписи отправляются с parse_mode HTML — используем это для жирного текста. */
export const CAPTION_PARSE_MODE = "HTML" as const;

/** Минимальный HTML-escape для безопасных подписей (категория из БД). */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Параметры для построения подписи. Используется и для уже сохранённых товаров
 * (через buildCaption), и для превью в /add_product до сохранения в БД.
 */
type CaptionParts = {
  categoryName: string;
  size: string;
  condition: number;
  price: number;
};

export function buildCaptionFromParts(parts: CaptionParts): string {
  return [
    `<b>${escapeHtml(parts.categoryName)}</b>`,
    "",
    `Размер: ${parts.size}`,
    `Состояние: ${parts.condition}/10`,
    "",
    `<b>${parts.price}</b>`,
    "",
    `Купить: @${escapeHtml(config.sellerUsername)}`,
  ].join("\n");
}

/**
 * Формирует HTML-подпись поста товара. Формат:
 *
 *   <b>Категория</b>
 *
 *   Размер: M
 *   Состояние: 8/10
 *
 *   <b>7000</b>
 *
 *   Купить: @sellerUsername
 */
export function buildCaption(product: ProductForChannel): string {
  return buildCaptionFromParts({
    categoryName: product.category.name,
    size: product.size,
    condition: product.condition,
    price: product.price,
  });
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
      parse_mode: idx === 0 ? CAPTION_PARSE_MODE : undefined,
    }))
  );

  return messages.map((m) => m.message_id);
}

// ─── Заглушки для последующих этапов ──────────────────────────────────────────

/**
 * Редактирует подпись первого сообщения альбома в канале — нужно при
 * редактировании категории/размера/состояния/цены товара (фото не меняются).
 */
export async function updateChannelCaption(
  api: Api,
  product: ProductForChannel
): Promise<void> {
  if (!CHANNEL_ID) throw new Error("CHANNEL_ID не задан в .env");
  if (product.channelMessageIds.length === 0) {
    // Поста в канале нет (например, публикация когда-то упала) — нечего обновлять.
    return;
  }

  await api
    .editMessageCaption(CHANNEL_ID, product.channelMessageIds[0], {
      caption: buildCaption(product),
      parse_mode: CAPTION_PARSE_MODE,
    })
    .catch((e) => {
      // Если текст уже актуален — Telegram возвращает 400, это не ошибка для нас.
      if (isNotModifiedError(e)) return;
      throw e;
    });
}

/**
 * Редактирует фото в опубликованном альбоме «один-к-одному» через
 * editMessageMedia. Message_id-ы сохраняются, подписчики канала не получают
 * уведомление о новом посте.
 *
 * Требует, чтобы количество photos совпадало с количеством сохранённых
 * channelMessageIds — Telegram не позволяет добавлять/удалять элементы
 * media group после публикации.
 *
 * Подпись (caption) обновляется на первом сообщении.
 */
export async function editChannelMedia(
  api: Api,
  product: ProductForChannel,
  photos: Photo[]
): Promise<void> {
  if (!CHANNEL_ID) throw new Error("CHANNEL_ID не задан в .env");
  if (product.channelMessageIds.length === 0) return;
  if (photos.length !== product.channelMessageIds.length) {
    throw new Error(
      `editChannelMedia: количество фото (${photos.length}) не совпадает ` +
        `с количеством сообщений альбома в канале (${product.channelMessageIds.length}). ` +
        `Для смены количества фото используй deleteChannelPost + publishToChannel.`
    );
  }

  const sorted = [...photos].sort((a, b) => a.order - b.order);
  const caption = buildCaption(product);

  for (let i = 0; i < sorted.length; i++) {
    const photo = sorted[i];
    const messageId = product.channelMessageIds[i];
    const isFirst = i === 0;

    await api
      .editMessageMedia(CHANNEL_ID, messageId, {
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
 * Удаляет все сообщения альбома из канала + очищает `channelMessageIds` в БД.
 * Используется при смене фото: Telegram не разрешает редактировать медиа в
 * опубликованном альбоме, поэтому пост удаляется и публикуется заново.
 *
 * deleteMessage оборачивается в catch — если сообщение уже удалено вручную
 * админом или истёк срок удаления (>48h для не-админа), это не должно
 * валить весь флоу.
 */
export async function deleteChannelPost(
  api: Api,
  product: ProductForChannel
): Promise<void> {
  if (!CHANNEL_ID) throw new Error("CHANNEL_ID не задан в .env");

  for (const id of product.channelMessageIds) {
    await api.deleteMessage(CHANNEL_ID, id).catch((e) => {
      console.warn(
        `channel deleteMessage failed for ${id}:`,
        e instanceof Error ? e.message : e
      );
    });
  }
  await prisma.product.update({
    where: { id: product.id },
    data: { channelMessageIds: [] },
  });
}

/** Метка «продано», префикс к caption и тексту служебного сообщения. */
export const SOLD_MARK = "❌ ПРОДАНО";

/** Подпись для проданного товара: «❌ ПРОДАНО» жирным + обычная подпись. */
export function buildSoldCaption(product: ProductForChannel): string {
  return `<b>${SOLD_MARK}</b>\n\n${buildCaption(product)}`;
}

/**
 * Помечает товар в канале как продано — редактирует подпись первого
 * сообщения альбома, дописывая в начало «❌ ПРОДАНО».
 */
export async function markChannelAsSold(
  api: Api,
  product: ProductForChannel
): Promise<void> {
  if (!CHANNEL_ID) throw new Error("CHANNEL_ID не задан в .env");
  if (product.channelMessageIds.length === 0) return;

  await api
    .editMessageCaption(CHANNEL_ID, product.channelMessageIds[0], {
      caption: buildSoldCaption(product),
      parse_mode: CAPTION_PARSE_MODE,
    })
    .catch((e) => {
      if (isNotModifiedError(e)) return;
      throw e;
    });
}

/**
 * Возвращает товар в продажу: убирает «❌ ПРОДАНО» из подписи (восстанавливает
 * чистый buildCaption). Семантически отдельная функция, но реализация
 * совпадает с updateChannelCaption.
 */
export async function restoreChannelFromSold(
  api: Api,
  product: ProductForChannel
): Promise<void> {
  return updateChannelCaption(api, product);
}
