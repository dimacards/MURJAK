import { InlineKeyboard } from "grammy";
import type { AppContext, AppConversation } from "../types";
import { prisma } from "../../db";
import { uploadTelegramPhotoToSupabase } from "../upload";
import { supabase, SUPABASE_BUCKET } from "../../supabase";
import { renderProductMenu } from "../handlers/products";
import { collectAllPhotos, collectVideo } from "./add-product";

const MAX_NAME = 200;
const MAX_FEATURE = 200;
const MAX_PRICE = 100_000_000;

const CB_CANCEL = "ep:cancel";

function cancelOnly(): InlineKeyboard {
  return new InlineKeyboard().text("Отмена", CB_CANCEL);
}

// ─────────────────────────────────────────────────────────────────────────────
// Редактирование названия
// ─────────────────────────────────────────────────────────────────────────────

export async function editNameConversation(
  conversation: AppConversation,
  ctx: AppContext,
  productId: number,
): Promise<void> {
  const product = await conversation.external(() =>
    prisma.product.findUnique({
      where: { id: productId },
      select: { name: true },
    }),
  );
  if (!product) {
    await ctx.reply(`Товар #${productId} не найден.`);
    return;
  }

  const prompt = await ctx.reply(
    `Текущее название: «${product.name}»\nНовое название?`,
    { reply_markup: cancelOnly() },
  );

  while (true) {
    const next = await conversation.wait();

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery().catch(() => {});
      await removeKeyboard(ctx, prompt.message_id);
      await ctx.reply("Изменение отменено.");
      return;
    }

    const text = next.message?.text?.trim();
    if (text === undefined) {
      await next.reply("Жду новое название текстом или нажми отмену.");
      continue;
    }
    if (text === "/cancel") {
      await removeKeyboard(ctx, prompt.message_id);
      await next.reply("Изменение отменено.");
      return;
    }
    if (text.length === 0 || text.length > MAX_NAME) {
      await next.reply(`Название 1–${MAX_NAME} символов. Повтори.`);
      continue;
    }

    await conversation.external(() =>
      prisma.product.update({
        where: { id: productId },
        data: { name: text },
      }),
    );
    await removeKeyboard(ctx, prompt.message_id);
    await ctx.reply("Название обновлено.");
    await renderProductMenu(ctx, productId, "send");
    return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Редактирование цены
// ─────────────────────────────────────────────────────────────────────────────

export async function editPriceConversation(
  conversation: AppConversation,
  ctx: AppContext,
  productId: number,
): Promise<void> {
  const product = await conversation.external(() =>
    prisma.product.findUnique({
      where: { id: productId },
      select: { price: true },
    }),
  );
  if (!product) {
    await ctx.reply(`Товар #${productId} не найден.`);
    return;
  }

  const prompt = await ctx.reply(
    `Текущая цена: ${product.price}\nНовая цена (целое число рублей)?`,
    { reply_markup: cancelOnly() },
  );

  while (true) {
    const next = await conversation.wait();

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery().catch(() => {});
      await removeKeyboard(ctx, prompt.message_id);
      await ctx.reply("Изменение отменено.");
      return;
    }

    const text = next.message?.text?.trim();
    if (text === undefined) {
      await next.reply("Жду цену числом или нажми отмену.");
      continue;
    }
    if (text === "/cancel") {
      await removeKeyboard(ctx, prompt.message_id);
      await next.reply("Изменение отменено.");
      return;
    }
    const parsed = Number(text.replace(/\s/g, ""));
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_PRICE) {
      await next.reply(
        "Цена должна быть положительным целым числом. Повтори.",
      );
      continue;
    }

    await conversation.external(() =>
      prisma.product.update({
        where: { id: productId },
        data: { price: parsed },
      }),
    );
    await removeKeyboard(ctx, prompt.message_id);
    await ctx.reply("Цена обновлена.");
    await renderProductMenu(ctx, productId, "send");
    return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Полная перезагрузка фото
// ─────────────────────────────────────────────────────────────────────────────

export async function editPhotosConversation(
  conversation: AppConversation,
  ctx: AppContext,
  productId: number,
): Promise<void> {
  const exists = await conversation.external(() =>
    prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    }),
  );
  if (!exists) {
    await ctx.reply(`Товар #${productId} не найден.`);
    return;
  }

  await ctx.reply(
    `Перезагрузка фото товара #${productId}.\n` +
      `Сейчас соберём новые фото (на модели + вещь) — старые будут удалены ` +
      `только после загрузки новых. Отмена на любом шаге оставляет всё как было.`,
  );

  // Тот же двухпроходный сбор, что и в /add_product: модель → вещь.
  const collected = await collectAllPhotos(conversation, ctx);
  if (collected === "cancel") {
    await ctx.reply("Изменение отменено. Старые фото на месте.");
    return;
  }

  const status = await ctx.reply("Сохраняю новые фото…");

  try {
    await conversation.external(async () => {
      // 1. Удалить старые файлы из Storage
      const oldPhotos = await prisma.photo.findMany({
        where: { productId },
        select: { storagePath: true },
      });
      if (oldPhotos.length > 0) {
        const paths = oldPhotos.map((p) => p.storagePath);
        const { error } = await supabase.storage
          .from(SUPABASE_BUCKET)
          .remove(paths);
        if (error) {
          console.warn("[edit photos] remove old warning:", error.message);
        }
      }
      // 2. Удалить старые Photo-записи
      await prisma.photo.deleteMany({ where: { productId } });
      // 3. Залить новые с timestamp-префиксом (чтобы CDN-кэш не подложил
      //    старое изображение под тем же путём)
      const ts = Date.now();
      for (let i = 0; i < collected.length; i++) {
        const storagePath = `products/${productId}/${ts}-${i}.jpg`;
        const { publicUrl } = await uploadTelegramPhotoToSupabase(
          ctx.api,
          collected[i].fileId,
          storagePath,
        );
        await prisma.photo.create({
          data: {
            productId,
            storagePath,
            publicUrl,
            telegramFileId: collected[i].fileId,
            order: i,
            kind: collected[i].kind,
          },
        });
      }
    });

    await ctx.api
      .editMessageText(
        ctx.chat!.id,
        status.message_id,
        `Фото обновлены (${collected.length} шт.).`,
      )
      .catch(() => {});
    await renderProductMenu(ctx, productId, "send");
  } catch (e) {
    console.error("[edit photos] save failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.api
      .editMessageText(
        ctx.chat!.id,
        status.message_id,
        `Не получилось сохранить: ${msg}`,
      )
      .catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Видео: заменить / добавить / удалить
// ─────────────────────────────────────────────────────────────────────────────

export async function editVideoConversation(
  conversation: AppConversation,
  ctx: AppContext,
  productId: number,
): Promise<void> {
  const product = await conversation.external(() =>
    prisma.product.findUnique({
      where: { id: productId },
      select: { videoStoragePath: true },
    }),
  );
  if (!product) {
    await ctx.reply(`Товар #${productId} не найден.`);
    return;
  }

  const hasVideo = !!product.videoStoragePath;

  if (hasVideo) {
    // Отдельный диалог: заменить новое видео / удалить текущее / отмена.
    const prompt = await ctx.reply(
      "У товара уже есть видео. Пришли новое (до 20 МБ), чтобы заменить, " +
        "или удали текущее.",
      {
        reply_markup: new InlineKeyboard()
          .text("🗑 Удалить видео", "ep:vdel")
          .row()
          .text("Отмена", CB_CANCEL),
      },
    );

    while (true) {
      const next = await conversation.wait();

      if (
        next.callbackQuery?.data === CB_CANCEL ||
        next.message?.text?.trim() === "/cancel"
      ) {
        if (next.callbackQuery) {
          await next.answerCallbackQuery().catch(() => {});
        }
        await removeKeyboard(ctx, prompt.message_id);
        await ctx.reply("Изменение отменено.");
        return;
      }

      if (next.callbackQuery?.data === "ep:vdel") {
        await next.answerCallbackQuery().catch(() => {});
        await removeKeyboard(ctx, prompt.message_id);
        await conversation.external(async () => {
          const p = await prisma.product.findUnique({
            where: { id: productId },
            select: { videoStoragePath: true },
          });
          if (p?.videoStoragePath) {
            const { error } = await supabase.storage
              .from(SUPABASE_BUCKET)
              .remove([p.videoStoragePath]);
            if (error) {
              console.warn("[edit video] remove warning:", error.message);
            }
          }
          await prisma.product.update({
            where: { id: productId },
            data: {
              videoStoragePath: null,
              videoPublicUrl: null,
              videoTelegramFileId: null,
            },
          });
        });
        await ctx.reply("Видео удалено.");
        await renderProductMenu(ctx, productId, "send");
        return;
      }

      const v = next.message?.video;
      if (v) {
        await removeKeyboard(ctx, prompt.message_id);
        await saveVideo(conversation, ctx, productId, v.file_id, v.file_size);
        return;
      }

      await next.reply("Жду видео или нажми кнопку.");
    }
  }

  // Видео ещё нет — собираем через общий коллектор.
  const collected = await collectVideo(conversation, ctx, {
    intro: "Пришли видео вещи (до 20 МБ) или нажми «отмена без видео».",
    skipLabel: "отмена, без видео",
  });
  if (collected === "cancel" || collected === null) {
    await ctx.reply("Изменение отменено.");
    return;
  }
  await saveVideo(conversation, ctx, productId, collected.fileId, undefined);
}

const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

async function saveVideo(
  conversation: AppConversation,
  ctx: AppContext,
  productId: number,
  fileId: string,
  fileSize: number | undefined,
): Promise<void> {
  if (fileSize !== undefined && fileSize > MAX_VIDEO_BYTES) {
    await ctx.reply(
      "Видео больше 20 МБ — Telegram не даёт боту его скачать. Сожми и попробуй снова.",
    );
    return;
  }

  const status = await ctx.reply("Сохраняю видео…");
  try {
    await conversation.external(async () => {
      // Удаляем старый файл (если был) и заливаем новый с ts-суффиксом,
      // чтобы CDN-кэш не отдал старое видео по тому же пути.
      const p = await prisma.product.findUnique({
        where: { id: productId },
        select: { videoStoragePath: true },
      });
      if (p?.videoStoragePath) {
        const { error } = await supabase.storage
          .from(SUPABASE_BUCKET)
          .remove([p.videoStoragePath]);
        if (error) {
          console.warn("[edit video] remove old warning:", error.message);
        }
      }
      const videoPath = `products/${productId}/video-${Date.now()}.mp4`;
      const { publicUrl } = await uploadTelegramPhotoToSupabase(
        ctx.api,
        fileId,
        videoPath,
      );
      await prisma.product.update({
        where: { id: productId },
        data: {
          videoStoragePath: videoPath,
          videoPublicUrl: publicUrl,
          videoTelegramFileId: fileId,
        },
      });
    });

    await ctx.api
      .editMessageText(ctx.chat!.id, status.message_id, "Видео обновлено.")
      .catch(() => {});
    await renderProductMenu(ctx, productId, "send");
  } catch (e) {
    console.error("[edit video] save failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.api
      .editMessageText(
        ctx.chat!.id,
        status.message_id,
        `Не получилось сохранить видео: ${msg}`,
      )
      .catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Добавление одной особенности (из подменю features)
// ─────────────────────────────────────────────────────────────────────────────

export async function addFeatureConversation(
  conversation: AppConversation,
  ctx: AppContext,
  productId: number,
): Promise<void> {
  const exists = await conversation.external(() =>
    prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    }),
  );
  if (!exists) {
    await ctx.reply(`Товар #${productId} не найден.`);
    return;
  }

  const prompt = await ctx.reply(
    "Текст новой особенности?",
    { reply_markup: cancelOnly() },
  );

  while (true) {
    const next = await conversation.wait();

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery().catch(() => {});
      await removeKeyboard(ctx, prompt.message_id);
      await ctx.reply("Добавление отменено.");
      return;
    }

    const text = next.message?.text?.trim();
    if (text === undefined) {
      await next.reply("Жду текст или нажми отмену.");
      continue;
    }
    if (text === "/cancel") {
      await removeKeyboard(ctx, prompt.message_id);
      await next.reply("Добавление отменено.");
      return;
    }
    if (text.length === 0 || text.length > MAX_FEATURE) {
      await next.reply(`Особенность 1–${MAX_FEATURE} символов. Повтори.`);
      continue;
    }

    await conversation.external(async () => {
      // Порядок = текущее количество (новая особенность — последняя в списке)
      const count = await prisma.feature.count({ where: { productId } });
      await prisma.feature.create({
        data: { productId, text, order: count },
      });
    });
    await removeKeyboard(ctx, prompt.message_id);
    await ctx.reply("Добавлено.");
    await renderProductMenu(ctx, productId, "send");
    return;
  }
}

async function removeKeyboard(
  ctx: AppContext,
  messageId: number,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;
  await ctx.api
    .editMessageReplyMarkup(chatId, messageId, { reply_markup: undefined })
    .catch(() => {});
}
