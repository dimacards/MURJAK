import { InlineKeyboard } from "grammy";
import type { AppContext, AppConversation } from "../types";
import { prisma } from "../../db";
import { uploadTelegramPhotoToSupabase } from "../upload";
import { supabase, SUPABASE_BUCKET } from "../../supabase";
import { renderProductMenu } from "../handlers/products";

const MAX_PHOTOS = 10;
const MAX_NAME = 200;
const MAX_FEATURE = 200;
const MAX_PRICE = 100_000_000;

const CB_CANCEL = "ep:cancel";

function cancelOnly(): InlineKeyboard {
  return new InlineKeyboard().text("❌ Отмена", CB_CANCEL);
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
      await next.answerCallbackQuery();
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
      await next.answerCallbackQuery();
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

  const initial = await ctx.reply(
    `Перезагрузка фото товара #${productId}.\n` +
      `Пришли новые фото (1-10). Старые ВСЕ будут удалены, как только нажмёшь «готово».`,
    { reply_markup: cancelOnly() },
  );

  let promptMessageId: number | undefined = initial.message_id;
  const showPrompt = async (text: string, kb: InlineKeyboard | undefined) => {
    const chatId = ctx.chat?.id;
    if (promptMessageId !== undefined && chatId !== undefined) {
      try {
        await ctx.api.editMessageText(chatId, promptMessageId, text, {
          reply_markup: kb,
        });
        return;
      } catch {
        promptMessageId = undefined;
      }
    }
    const sent = await ctx.reply(text, { reply_markup: kb });
    promptMessageId = sent.message_id;
  };

  const fileIds: string[] = [];
  const photoKb = () =>
    new InlineKeyboard()
      .text("➕ ещё фото", "ep:pmore")
      .text("✅ готово", "ep:pdone")
      .row()
      .text("❌ Отмена", CB_CANCEL);

  while (fileIds.length < MAX_PHOTOS) {
    const next = await conversation.wait();

    if (next.message?.text?.trim() === "/cancel") {
      await next.reply("Изменение отменено. Старые фото на месте.");
      return;
    }

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery();
      await showPrompt("Изменение отменено. Старые фото на месте.", undefined);
      return;
    }

    if (next.message?.photo) {
      const sizes = next.message.photo;
      const best = sizes[sizes.length - 1];
      fileIds.push(best.file_id);

      if (fileIds.length >= MAX_PHOTOS) {
        await showPrompt(
          `${MAX_PHOTOS}/${MAX_PHOTOS} — максимум.`,
          undefined,
        );
        break;
      }

      await showPrompt(
        `Фото ${fileIds.length}/${MAX_PHOTOS}. Добавить ещё или закончить?`,
        photoKb(),
      );
      continue;
    }

    if (next.callbackQuery?.data === "ep:pdone") {
      await next.answerCallbackQuery();
      if (fileIds.length === 0) {
        await showPrompt(
          "Нужно хотя бы одно новое фото — старые не будут удалены без замены.",
          photoKb(),
        );
        continue;
      }
      break;
    }

    if (next.callbackQuery?.data === "ep:pmore") {
      await next.answerCallbackQuery({ text: "Жду фото" });
      continue;
    }

    await next.reply("Жду фото или нажми кнопку.");
  }

  if (fileIds.length === 0) {
    await ctx.reply("Без новых фото изменение отменено.");
    return;
  }

  await showPrompt("Сохраняю новые фото...", undefined);

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
      for (let i = 0; i < fileIds.length; i++) {
        const fileId = fileIds[i];
        const storagePath = `products/${productId}/${ts}-${i}.jpg`;
        const { publicUrl } = await uploadTelegramPhotoToSupabase(
          ctx.api,
          fileId,
          storagePath,
        );
        await prisma.photo.create({
          data: {
            productId,
            storagePath,
            publicUrl,
            telegramFileId: fileId,
            order: i,
          },
        });
      }
    });

    await showPrompt(`Фото обновлены (${fileIds.length} шт.).`, undefined);
    await renderProductMenu(ctx, productId, "send");
  } catch (e) {
    console.error("[edit photos] save failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    await showPrompt(`Не получилось сохранить: ${msg}`, undefined);
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
      await next.answerCallbackQuery();
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
