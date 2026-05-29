import { InlineKeyboard } from "grammy";
import type { Category, Photo, Product } from "@prisma/client";
import { prisma } from "../../db";
import { supabase, SUPABASE_BUCKET } from "../../supabase";
import type { AppContext, AppConversation } from "../types";
import { uploadTelegramPhotoToSupabase } from "../upload";
import {
  deleteChannelPost,
  editChannelMedia,
  publishToChannel,
  updateChannelCaption,
} from "../channel";
import {
  deleteServicePost,
  editServiceMedia,
  restoreServiceButtons,
  sendToServiceChat,
  updateServiceCaption,
  updateServiceMessage,
} from "../service-chat";

const MAX_PHOTOS = 10;

export type EditField =
  | "photos"
  | "category"
  | "size"
  | "condition"
  | "price"
  | "description";

type ProductWithRelations = Product & {
  category: Category;
  photos: Photo[];
};

/**
 * Главный edit-conversation. Входная точка — клик editfield:{id}:{field} в ЛС
 * (бот отправляет это меню после клика «✏️ Редактировать» в служебном чате).
 *
 * Любой whitelisted работник может редактировать (нет ownerOnly).
 *
 * MVP-ограничение: если двое одновременно нажмут «Редактировать», оба попадут
 * в свои ЛС и второй может перетереть работу первого. В будущем — поле
 * Product.editingByWorkerId с таймаутом.
 */
export async function editProductConversation(
  conversation: AppConversation,
  ctx: AppContext,
  productId: number,
  field: EditField
): Promise<void> {
  const product = await conversation.external(() =>
    prisma.product.findUnique({
      where: { id: productId },
      include: { category: true, photos: true },
    })
  );
  if (!product) {
    await ctx.reply("Товар не найден.");
    return;
  }

  try {
    if (field === "category") await editCategory(conversation, ctx, product);
    else if (field === "size") await editSize(conversation, ctx, product);
    else if (field === "condition")
      await editCondition(conversation, ctx, product);
    else if (field === "price") await editPrice(conversation, ctx, product);
    else if (field === "description")
      await editDescription(conversation, ctx, product);
    else if (field === "photos") await editPhotos(conversation, ctx, product);
  } catch (e) {
    console.error("editProductConversation failed:", e);
    await ctx.reply(
      `Ошибка: ${e instanceof Error ? e.message : String(e)}\nВозвращаюсь к товару.`
    );
    await safeRestore(conversation, ctx, product.id);
  }
}

// ─── Общие helpers ────────────────────────────────────────────────────────────

async function safeRestore(
  conversation: AppConversation,
  ctx: AppContext,
  productId: number
): Promise<void> {
  try {
    const fresh = await conversation.external(() =>
      prisma.product.findUnique({
        where: { id: productId },
        include: { category: true },
      })
    );
    if (fresh) await restoreServiceButtons(ctx.api, fresh);
  } catch (e) {
    console.warn("safeRestore failed:", e instanceof Error ? e.message : e);
  }
}

async function cancelAndRestore(
  conversation: AppConversation,
  ctx: AppContext,
  productId: number
): Promise<void> {
  await ctx.reply("Отмена. Возвращаюсь к товару.");
  await safeRestore(conversation, ctx, productId);
}

async function finishEdit(
  ctx: AppContext,
  updated: ProductWithRelations,
  noteSuffix: string = ""
): Promise<void> {
  // 1. Подпись альбома в канале.
  await updateChannelCaption(ctx.api, updated);
  // 2. Подпись альбома в служебном чате (та же подпись).
  await updateServiceCaption(ctx.api, updated);
  // 3. Сообщение под альбомом в служебном чате — текст + восстановление кнопок.
  //    Если только размер/состояние изменились, текст может совпасть с прошлым —
  //    updateServiceMessage сам проглатывает «message is not modified».
  await updateServiceMessage(ctx.api, updated);

  await ctx.reply(`Готово. Товар №${updated.id} обновлён.${noteSuffix}`);
}

// ─── Категория ────────────────────────────────────────────────────────────────

async function editCategory(
  conversation: AppConversation,
  ctx: AppContext,
  product: ProductWithRelations
): Promise<void> {
  const categories = await conversation.external(() =>
    prisma.category.findMany({ orderBy: { name: "asc" } })
  );
  if (categories.length === 0) {
    await ctx.reply(
      "Категорий нет. Попроси владельца добавить через /add_category."
    );
    await safeRestore(conversation, ctx, product.id);
    return;
  }

  const kb = new InlineKeyboard();
  for (const c of categories) kb.text(c.name, `edc:${c.id}`).row();
  kb.text("↩️ Отмена", "edc:cancel");
  await ctx.reply("Выбери новую категорию:", { reply_markup: kb });

  while (true) {
    const next = await conversation.waitForCallbackQuery(/^edc:(\d+|cancel)$/);
    const data = next.callbackQuery.data ?? "";
    if (data === "edc:cancel") {
      await next.answerCallbackQuery();
      await cancelAndRestore(conversation, ctx, product.id);
      return;
    }
    const m = data.match(/^edc:(\d+)$/);
    if (m) {
      await next.answerCallbackQuery();
      const updated = await conversation.external(() =>
        prisma.product.update({
          where: { id: product.id },
          data: { categoryId: Number(m[1]) },
          include: { category: true, photos: true },
        })
      );
      await finishEdit(ctx, updated);
      return;
    }
  }
}

// ─── Размер ───────────────────────────────────────────────────────────────────

async function editSize(
  conversation: AppConversation,
  ctx: AppContext,
  product: ProductWithRelations
): Promise<void> {
  const isShoe = product.category.sizeType === "SHOE";

  if (isShoe) {
    // Обувь — ручной ввод нового размера.
    await ctx.reply(
      "Укажи новый размер обуви (например, 42 или 42.5) или /cancel:"
    );
    while (true) {
      const next = await conversation.waitFor("message:text");
      const t = next.message.text.trim();
      if (t === "/cancel") {
        await cancelAndRestore(conversation, ctx, product.id);
        return;
      }
      if (!t || t.length > 10) {
        await next.reply("Некорректный размер. Введи ещё раз (или /cancel):");
        continue;
      }
      const updated = await conversation.external(() =>
        prisma.product.update({
          where: { id: product.id },
          data: { size: t },
          include: { category: true, photos: true },
        })
      );
      await finishEdit(ctx, updated);
      return;
    }
  }

  // Одежда — кнопки XS..XXL.
  const kb = new InlineKeyboard()
    .text("XS", "eds:XS")
    .text("S", "eds:S")
    .text("M", "eds:M")
    .row()
    .text("L", "eds:L")
    .text("XL", "eds:XL")
    .text("XXL", "eds:XXL")
    .row()
    .text("↩️ Отмена", "eds:cancel");
  await ctx.reply("Выбери новый размер:", { reply_markup: kb });

  while (true) {
    const next = await conversation.waitForCallbackQuery(
      /^eds:(XS|S|M|L|XL|XXL|cancel)$/
    );
    const data = next.callbackQuery.data ?? "";
    if (data === "eds:cancel") {
      await next.answerCallbackQuery();
      await cancelAndRestore(conversation, ctx, product.id);
      return;
    }
    const m = data.match(/^eds:(XS|S|M|L|XL|XXL)$/);
    if (m) {
      await next.answerCallbackQuery();
      const updated = await conversation.external(() =>
        prisma.product.update({
          where: { id: product.id },
          data: { size: m[1] },
          include: { category: true, photos: true },
        })
      );
      await finishEdit(ctx, updated);
      return;
    }
  }
}

// ─── Состояние ────────────────────────────────────────────────────────────────

async function editCondition(
  conversation: AppConversation,
  ctx: AppContext,
  product: ProductWithRelations
): Promise<void> {
  await ctx.reply(
    "Укажи новое состояние (целое число от 1 до 10) или /cancel:"
  );
  while (true) {
    const next = await conversation.waitFor("message:text");
    const text = next.message.text.trim();
    if (text === "/cancel") {
      await cancelAndRestore(conversation, ctx, product.id);
      return;
    }
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      await next.reply(
        "Не целое число от 1 до 10. Попробуй ещё раз или /cancel:"
      );
      continue;
    }
    const updated = await conversation.external(() =>
      prisma.product.update({
        where: { id: product.id },
        data: { condition: n },
        include: { category: true, photos: true },
      })
    );
    await finishEdit(ctx, updated);
    return;
  }
}

// ─── Цена ─────────────────────────────────────────────────────────────────────

async function editPrice(
  conversation: AppConversation,
  ctx: AppContext,
  product: ProductWithRelations
): Promise<void> {
  await ctx.reply(
    "Укажи новую цену в рублях (целое положительное число) или /cancel:"
  );
  while (true) {
    const next = await conversation.waitFor("message:text");
    const text = next.message.text.trim();
    if (text === "/cancel") {
      await cancelAndRestore(conversation, ctx, product.id);
      return;
    }
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1) {
      await next.reply(
        "Не положительное целое число. Попробуй ещё раз или /cancel:"
      );
      continue;
    }
    const updated = await conversation.external(() =>
      prisma.product.update({
        where: { id: product.id },
        data: { price: n },
        include: { category: true, photos: true },
      })
    );
    await finishEdit(ctx, updated);
    return;
  }
}

// ─── Описание (title) ────────────────────────────────────────────────────────

async function editDescription(
  conversation: AppConversation,
  ctx: AppContext,
  product: ProductWithRelations
): Promise<void> {
  const current = product.description ? `«${product.description}»` : "не задано";
  await ctx.reply(
    `Текущее название: ${current}.\n` +
      `Введи новое название (или «.» чтобы стереть, /cancel для отмены):`
  );
  while (true) {
    const next = await conversation.waitFor("message:text");
    const text = next.message.text.trim();
    if (text === "/cancel") {
      await cancelAndRestore(conversation, ctx, product.id);
      return;
    }
    if (text === ".") {
      // стираем
      const updated = await conversation.external(() =>
        prisma.product.update({
          where: { id: product.id },
          data: { description: null },
          include: { category: true, photos: true },
        })
      );
      await finishEdit(ctx, updated);
      return;
    }
    if (!text) {
      await next.reply("Пустое название. Введи ещё раз, или «.» чтобы стереть, или /cancel:");
      continue;
    }
    if (text.length > 200) {
      await next.reply("Слишком длинно (макс. 200 символов). Сократи или /cancel:");
      continue;
    }
    const updated = await conversation.external(() =>
      prisma.product.update({
        where: { id: product.id },
        data: { description: text },
        include: { category: true, photos: true },
      })
    );
    await finishEdit(ctx, updated);
    return;
  }
}

// ─── Фото (полное пересоздание поста в канале и в служебном чате) ────────────

async function editPhotos(
  conversation: AppConversation,
  ctx: AppContext,
  product: ProductWithRelations
): Promise<void> {
  await ctx.reply(
    `Загрузи новый набор фото (1-${MAX_PHOTOS}). Старые удалятся. ` +
      `Альбом в канале и в служебном чате будет пересоздан. Чтобы отменить — /cancel.`,
    { reply_markup: new InlineKeyboard().text("Отмена", "edp:cancel") }
  );

  const newPhotos: { fileId: string }[] = [];
  // Одно сообщение-индикатор: первое фото создаёт его, остальные — редактируют.
  let promptMessageId: number | undefined = undefined;

  collecting: while (true) {
    if (newPhotos.length >= MAX_PHOTOS) break;
    const next = await conversation.wait();

    if (next.message?.text === "/cancel") {
      await cancelAndRestore(conversation, ctx, product.id);
      return;
    }

    if (next.callbackQuery) {
      const d = next.callbackQuery.data ?? "";
      if (d === "edp:cancel") {
        await next.answerCallbackQuery();
        await cancelAndRestore(conversation, ctx, product.id);
        return;
      }
      if (d === "edp:done") {
        if (newPhotos.length === 0) {
          await next.answerCallbackQuery({
            text: "Нужно хотя бы одно фото.",
            show_alert: true,
          });
          continue collecting;
        }
        await next.answerCallbackQuery();
        break collecting;
      }
      await next.answerCallbackQuery();
      continue;
    }

    if (next.message?.photo) {
      const sizes = next.message.photo;
      const best = sizes[sizes.length - 1];
      newPhotos.push({ fileId: best.file_id });

      const limitReached = newPhotos.length >= MAX_PHOTOS;
      const text = limitReached
        ? `Лимит ${MAX_PHOTOS} фото. Двигаемся дальше.`
        : `Фото ${newPhotos.length}. Можно ещё или жми «Готово».`;
      const kb = limitReached
        ? undefined
        : new InlineKeyboard()
            .text(`Готово (${newPhotos.length}/${MAX_PHOTOS})`, "edp:done")
            .text("Отмена", "edp:cancel");

      const chatId = next.chat?.id;
      if (promptMessageId !== undefined && chatId !== undefined) {
        await next.api
          .editMessageText(chatId, promptMessageId, text, {
            reply_markup: kb,
          })
          .catch(() => {});
      } else {
        const sent = await next.reply(text, { reply_markup: kb });
        promptMessageId = sent.message_id;
      }

      if (limitReached) break;
    }
  }

  // ─ Загружаем новые в Supabase ─
  const progress = await ctx.reply(
    `Загружаю новые фото (0/${newPhotos.length})...`
  );
  const ts = Date.now();
  const uploaded: Array<{
    telegramFileId: string;
    storagePath: string;
    publicUrl: string;
  }> = [];

  for (let i = 0; i < newPhotos.length; i++) {
    const p = newPhotos[i];
    const result = await conversation.external(() =>
      uploadTelegramPhotoToSupabase(
        ctx.api,
        p.fileId,
        `products/${ts}_${i}.jpg`
      )
    );
    uploaded.push({ telegramFileId: p.fileId, ...result });
    const chatId = ctx.chat?.id;
    if (chatId !== undefined) {
      await ctx.api
        .editMessageText(
          chatId,
          progress.message_id,
          `Загружаю новые фото (${i + 1}/${newPhotos.length})...`
        )
        .catch(() => {});
    }
  }

  // ─ Удаляем старые файлы из Supabase (best effort) ─
  if (product.photos.length > 0) {
    const oldPaths = product.photos.map((p) => p.storagePath);
    await conversation.external(async () => {
      const { error } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .remove(oldPaths);
      if (error) {
        console.warn("Failed to remove old Supabase files:", error);
      }
    });
  }

  // ─ Заменяем Photo записи в одной транзакции ─
  await conversation.external(() =>
    prisma.$transaction([
      prisma.photo.deleteMany({ where: { productId: product.id } }),
      prisma.photo.createMany({
        data: uploaded.map((u, idx) => ({
          productId: product.id,
          storagePath: u.storagePath,
          publicUrl: u.publicUrl,
          telegramFileId: u.telegramFileId,
          order: idx,
        })),
      }),
    ])
  );

  // ─ Перезагружаем продукт со свежими отношениями ─
  const updated = await conversation.external(() =>
    prisma.product.findUnique({
      where: { id: product.id },
      include: { category: true, photos: true },
    })
  );
  if (!updated) throw new Error("Товар исчез после обновления фото");

  // ─ Если количество фото не изменилось — редактируем альбом «на месте»
  //   (editMessageMedia). Подписчики канала не получают уведомление, в
  //   служебном чате не возникает спама. Message_id остаются прежними.
  //   Если количество разное — Telegram не позволяет менять размер media
  //   group, придётся пересоздавать.
  const sameCount =
    product.photos.length === updated.photos.length &&
    product.channelMessageIds.length === updated.photos.length &&
    product.serviceMediaMessageIds.length === updated.photos.length;

  if (sameCount) {
    await ctx.reply("Обновляю альбом в канале и служебном чате...");

    await editChannelMedia(ctx.api, updated, updated.photos);
    await editServiceMedia(ctx.api, updated, updated.photos);

    // Сообщение с кнопками в служебном чате сейчас в edit-lock'е —
    // нужно вернуть его в исходный вид (текст + 2 кнопки).
    await restoreServiceButtons(ctx.api, updated);

    await ctx.reply(
      `Готово. Товар №${product.id} обновлён. Фото отредактированы на месте.`
    );
    return;
  }

  // ─ Иначе — пересоздание (старый путь) ─
  await ctx.reply(
    `Количество фото изменилось (${product.photos.length} → ${updated.photos.length}). ` +
      `Пересоздаю пост в канале...`
  );
  await deleteChannelPost(ctx.api, updated); // очищает channelMessageIds в БД
  const newChannelIds = await publishToChannel(
    ctx.api,
    updated,
    updated.photos
  );
  await conversation.external(() =>
    prisma.product.update({
      where: { id: product.id },
      data: { channelMessageIds: newChannelIds },
    })
  );

  await ctx.reply("Пересоздаю в служебном чате...");
  await deleteServicePost(ctx.api, updated);
  const newServiceIds = await sendToServiceChat(
    ctx.api,
    updated,
    updated.photos
  );
  await conversation.external(() =>
    prisma.product.update({
      where: { id: product.id },
      data: {
        serviceMediaMessageIds: newServiceIds.mediaMessageIds,
        serviceMessageId: newServiceIds.controlMessageId,
      },
    })
  );

  await ctx.reply(
    `Готово. Товар №${product.id} обновлён. Альбом пересоздан в канале и в служебном чате.`
  );
}
