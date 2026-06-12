import { InlineKeyboard } from "grammy";
import type { PhotoKind } from "@prisma/client";
import type { AppContext, AppConversation } from "../types";
import { prisma } from "../../db";
import config from "../../config";
import { uploadTelegramPhotoToSupabase } from "../upload";

const MAX_PHOTOS = 10;
const MAX_NAME = 200;
const MAX_FEATURE = 200;
const MAX_FEATURES = 20;
const MAX_PRICE = 100_000_000;
// Telegram-боты могут скачивать через getFile только файлы до 20 МБ.
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

const CB_CANCEL = "ap:cancel";

export type CollectedPhoto = { fileId: string; kind: PhotoKind };
export type CollectedVideo = { fileId: string } | null;

function cancelKb(): InlineKeyboard {
  return new InlineKeyboard().text("Отмена", CB_CANCEL);
}

/**
 * Обновляет одно «живое» сообщение-подсказку (state.id) или, если его нет
 * / оно удалено, шлёт новое. ctx.api/ctx.reply вызываются НАПРЯМУЮ —
 * @grammyjs/conversations реплеит их сам, оборачивать в external НЕЛЬЗЯ.
 */
async function upsertPrompt(
  ctx: AppContext,
  state: { id: number | undefined },
  text: string,
  kb: InlineKeyboard | undefined,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (state.id !== undefined && chatId !== undefined) {
    try {
      await ctx.api.editMessageText(chatId, state.id, text, {
        reply_markup: kb,
      });
      return;
    } catch (e) {
      const msg = String((e as Error)?.message ?? "").toLowerCase();
      // Контент не изменился — это успех, ничего не шлём.
      if (msg.includes("not modified")) return;
      // Сообщение удалено/нельзя редактировать — отправим новое ниже.
      state.id = undefined;
    }
  }
  const sent = await ctx.reply(text, { reply_markup: kb });
  state.id = sent.message_id;
}

/** Снять клавиатуру с сообщения. ctx.api напрямую, ошибки глотаем. */
export async function stripKb(
  ctx: AppContext,
  messageId: number,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;
  try {
    await ctx.api.editMessageReplyMarkup(chatId, messageId, {
      reply_markup: undefined,
    });
  } catch {
    /* безразлично */
  }
}

/**
 * /add_product — пошаговый ввод товара.
 *
 * Шаги:
 *   1) фото на модели (0..N, можно пропустить)
 *   2) фото вещи (если на модели пусто — минимум 1)
 *   3) видео (опционально, до 20 МБ)
 *   4) название
 *   5) цена
 *   6) features (опционально)
 *   7) превью — публикация / отмена / изменение любого поля
 */
export async function addProductConversation(
  conversation: AppConversation,
  ctx: AppContext,
): Promise<void> {
  await ctx.reply(
    "Добавим новый товар. Кнопка «Отмена» или /cancel в любой момент прерывают.",
  );

  const photos0 = await collectAllPhotos(conversation, ctx);
  if (photos0 === "cancel") return;

  const video0 = await collectVideo(conversation, ctx, {
    intro:
      "Видео вещи (необязательно, до 20 МБ).\nПришли видео или нажми «пропустить».",
    skipLabel: "⏭ пропустить",
  });
  if (video0 === "cancel") return;

  const name0 = await collectName(conversation, ctx, {
    intro: "Название товара?",
  });
  if (name0 === "cancel") return;

  const price0 = await collectPrice(conversation, ctx, {
    intro: "Цена в рублях (целое число)?",
  });
  if (price0 === "cancel") return;

  const features0 = await collectFeatures(conversation, ctx, {
    intro:
      "Особенности товара (видны только на странице товара).\n" +
      "Введи первую строкой или нажми «готово».",
  });
  if (features0 === "cancel") return;

  let photos = photos0;
  let video = video0;
  let name = name0;
  let price = price0;
  let features = features0;

  let lastKbMsgId: number | undefined;

  while (true) {
    if (lastKbMsgId !== undefined) await stripKb(ctx, lastKbMsgId);

    // Альбом всех фото (caption на первом). Видео — отдельным сообщением,
    // чтобы не упереться в лимит 10 медиа на альбом.
    const caption = buildCaption(name, price, features);
    await ctx.replyWithMediaGroup(
      photos.map((p, i) => ({
        type: "photo" as const,
        media: p.fileId,
        caption: i === 0 ? caption : undefined,
      })),
    );
    if (video) {
      await ctx.replyWithVideo(video.fileId, { caption: "Видео вещи" });
    }

    const modelCount = photos.filter((p) => p.kind === "MODEL").length;
    const itemCount = photos.length - modelCount;
    const summary =
      `Фото: на модели ${modelCount}, вещь ${itemCount}\n` +
      `Видео: ${video ? "есть" : "нет"}`;

    const previewKb = new InlineKeyboard()
      .text("✅ Опубликовать", "ap:pub")
      .row()
      .text("📝 Название", "ap:ename")
      .text("💰 Цена", "ap:eprice")
      .row()
      .text("🖼 Фото", "ap:ephotos")
      .text("🎥 Видео", "ap:evideo")
      .row()
      .text("⭐ Особенности", "ap:efeats")
      .row()
      .text("Отмена", CB_CANCEL);

    const kbMsg = await ctx.reply(`${summary}\n\nЧто делаем?`, {
      reply_markup: previewKb,
    });
    lastKbMsgId = kbMsg.message_id;

    const dec = await conversation.waitForCallbackQuery(
      /^ap:(pub|cancel|ename|eprice|ephotos|evideo|efeats)$/,
    );
    await dec.answerCallbackQuery().catch(() => {});
    const action = dec.match?.[1];

    if (action === "cancel") {
      await stripKb(ctx, kbMsg.message_id);
      await ctx.reply("Добавление отменено.");
      return;
    }

    if (action === "pub") {
      await stripKb(ctx, kbMsg.message_id);
      await publish(conversation, ctx, { photos, video, name, price, features });
      return;
    }

    if (action === "ename") {
      const r = await collectName(conversation, ctx, {
        intro: "Новое название?",
        current: name,
      });
      if (r !== "cancel") name = r;
      continue;
    }
    if (action === "eprice") {
      const r = await collectPrice(conversation, ctx, {
        intro: "Новая цена?",
        current: price,
      });
      if (r !== "cancel") price = r;
      continue;
    }
    if (action === "ephotos") {
      const r = await collectAllPhotos(conversation, ctx);
      if (r !== "cancel") photos = r;
      continue;
    }
    if (action === "evideo") {
      const r = await collectVideo(conversation, ctx, {
        intro:
          (video ? "Текущее видео будет заменено.\n" : "") +
          "Пришли видео (до 20 МБ) или нажми «без видео».",
        skipLabel: "без видео",
      });
      if (r !== "cancel") video = r;
      continue;
    }
    if (action === "efeats") {
      const r = await collectFeatures(conversation, ctx, {
        intro:
          features.length > 0
            ? `Текущие особенности (${features.length}) будут заменены. ` +
              "Введи первую или нажми «готово (без особенностей)»."
            : "Введи первую особенность или нажми «готово».",
      });
      if (r !== "cancel") features = r;
      continue;
    }
  }
}

// ─── Сбор фото: два прохода (модель → вещь) ──────────────────────────────────

/**
 * Полный сбор фото: сначала «на модели» (можно пропустить), потом «вещь»
 * (если первых нет — минимум одно). Суммарный лимит MAX_PHOTOS.
 * Используется и в /add_product, и в редактировании фото.
 */
export async function collectAllPhotos(
  conversation: AppConversation,
  ctx: AppContext,
): Promise<CollectedPhoto[] | "cancel"> {
  const model = await collectPhotosOfKind(conversation, ctx, {
    intro:
      "Шаг 1/2 — фото НА МОДЕЛИ (одежда на человеке).\n" +
      "Пришли фото или нажми «пропустить».",
    allowEmpty: true,
    max: MAX_PHOTOS,
  });
  if (model === "cancel") return "cancel";

  const remaining = MAX_PHOTOS - model.length;
  let item: string[] = [];
  if (remaining > 0) {
    const r = await collectPhotosOfKind(conversation, ctx, {
      intro:
        "Шаг 2/2 — фото ВЕЩИ (без человека).\n" +
        (model.length > 0
          ? "Пришли фото или нажми «пропустить»."
          : "Пришли фото — нужно хотя бы одно в сумме."),
      allowEmpty: model.length > 0,
      max: remaining,
    });
    if (r === "cancel") return "cancel";
    item = r;
  }

  return [
    ...model.map((fileId) => ({ fileId, kind: "MODEL" as PhotoKind })),
    ...item.map((fileId) => ({ fileId, kind: "ITEM" as PhotoKind })),
  ];
}

/**
 * Сбор фото одного типа. Per-batch UX: внутри одного альбома (общий
 * media_group_id) обновляем ОДНО сообщение счётчиком; новый альбом или
 * одиночное фото — новое сообщение.
 */
async function collectPhotosOfKind(
  conversation: AppConversation,
  ctx: AppContext,
  opts: { intro: string; allowEmpty: boolean; max: number },
): Promise<string[] | "cancel"> {
  const initialKb = opts.allowEmpty
    ? new InlineKeyboard().text("⏭ пропустить", "ap:pdone").row().text("Отмена", CB_CANCEL)
    : cancelKb();
  const initial = await ctx.reply(opts.intro, { reply_markup: initialKb });
  const state = { id: initial.message_id as number | undefined };

  const kb = () =>
    new InlineKeyboard()
      .text("➕ ещё фото", "ap:pmore")
      .text("✅ готово", "ap:pdone")
      .row()
      .text("Отмена", CB_CANCEL);

  let batchKey: string | undefined;
  let batchCount = 0;

  const ids: string[] = [];
  while (ids.length < opts.max) {
    const next = await conversation.wait();

    if (next.message?.text?.trim() === "/cancel") {
      await upsertPrompt(ctx, state, "Отменено.", undefined);
      return "cancel";
    }
    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery().catch(() => {});
      await upsertPrompt(ctx, state, "Отменено.", undefined);
      return "cancel";
    }

    // Принимаем и обычные фото, и изображения-документы («Файл» без сжатия).
    // PNG с прозрачностью выживает ТОЛЬКО как документ — обычная отправка
    // фото пережимает в JPEG и теряет альфа-канал.
    const photoSizes = next.message?.photo;
    const doc = next.message?.document;
    const isImageDoc =
      doc !== undefined &&
      doc.mime_type !== undefined &&
      /^image\/(png|jpe?g|webp)$/.test(doc.mime_type);

    if (doc && !isImageDoc) {
      await next.reply(
        "Такой файл не подходит — жду изображение (png/jpg/webp) или фото.",
      );
      continue;
    }
    if (isImageDoc && doc.file_size !== undefined && doc.file_size > 20 * 1024 * 1024) {
      await next.reply("Файл больше 20 МБ — Telegram не даёт боту его скачать.");
      continue;
    }

    if (photoSizes || isImageDoc) {
      ids.push(
        photoSizes ? photoSizes[photoSizes.length - 1].file_id : doc!.file_id,
      );

      const mgi = next.message!.media_group_id;
      const isNewBatch =
        mgi === undefined || batchKey === undefined || mgi !== batchKey;
      if (isNewBatch) {
        if (state.id !== undefined && batchCount > 0) {
          await stripKb(ctx, state.id);
        }
        state.id = undefined;
        batchKey = mgi;
        batchCount = 0;
      }
      batchCount++;

      if (ids.length >= opts.max) {
        await upsertPrompt(
          ctx,
          state,
          `Готово, добавлено ${ids.length} фото (лимит).`,
          undefined,
        );
        return ids;
      }
      const suffix =
        batchCount === ids.length ? "" : ` (всего ${ids.length}/${opts.max})`;
      await upsertPrompt(
        ctx,
        state,
        `Фото в этой порции: ${batchCount}${suffix}. Добавить ещё или закончить?`,
        kb(),
      );
      continue;
    }

    if (next.callbackQuery?.data === "ap:pdone") {
      await next.answerCallbackQuery().catch(() => {});
      if (ids.length === 0) {
        if (opts.allowEmpty) {
          await upsertPrompt(ctx, state, "Пропущено.", undefined);
          return [];
        }
        await upsertPrompt(
          ctx,
          state,
          "Нужно хотя бы одно фото. Пришли его или нажми «Отмена».",
          cancelKb(),
        );
        continue;
      }
      await upsertPrompt(
        ctx,
        state,
        `Готово, добавлено ${ids.length} фото.`,
        undefined,
      );
      return ids;
    }

    if (next.callbackQuery?.data === "ap:pmore") {
      await next.answerCallbackQuery({ text: "Жду фото" }).catch(() => {});
      continue;
    }

    await next.reply("Жду фото или нажми кнопку.");
  }

  await upsertPrompt(ctx, state, `Готово, добавлено ${ids.length} фото.`, undefined);
  return ids;
}

// ─── Сбор видео ──────────────────────────────────────────────────────────────

/**
 * Видео вещи. Одно, опциональное. Telegram-боты скачивают файлы только
 * до 20 МБ (лимит getFile) — больший файл отклоняем сразу.
 */
export async function collectVideo(
  conversation: AppConversation,
  ctx: AppContext,
  opts: { intro: string; skipLabel: string },
): Promise<CollectedVideo | "cancel"> {
  const initial = await ctx.reply(opts.intro, {
    reply_markup: new InlineKeyboard()
      .text(opts.skipLabel, "ap:vskip")
      .row()
      .text("Отмена", CB_CANCEL),
  });
  const state = { id: initial.message_id as number | undefined };

  while (true) {
    const next = await conversation.wait();

    if (next.message?.text?.trim() === "/cancel") {
      await upsertPrompt(ctx, state, "Отменено.", undefined);
      return "cancel";
    }
    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery().catch(() => {});
      await upsertPrompt(ctx, state, "Отменено.", undefined);
      return "cancel";
    }
    if (next.callbackQuery?.data === "ap:vskip") {
      await next.answerCallbackQuery().catch(() => {});
      await upsertPrompt(ctx, state, "Без видео.", undefined);
      return null;
    }

    const v = next.message?.video;
    if (v) {
      if (v.file_size !== undefined && v.file_size > MAX_VIDEO_BYTES) {
        await next.reply(
          "Видео больше 20 МБ — Telegram не даёт боту его скачать. " +
            "Сожми/обрежь и пришли снова, или нажми кнопку.",
        );
        continue;
      }
      await upsertPrompt(ctx, state, "Видео получено.", undefined);
      return { fileId: v.file_id };
    }

    await next.reply("Жду видео или нажми кнопку.");
  }
}

// ─── Сбор названия / цены ────────────────────────────────────────────────────

async function collectName(
  conversation: AppConversation,
  ctx: AppContext,
  opts: { intro: string; current?: string },
): Promise<string | "cancel"> {
  const head = opts.current ? `Текущее: «${opts.current}»\n` : "";
  const prompt = await ctx.reply(head + opts.intro, { reply_markup: cancelKb() });

  while (true) {
    const next = await conversation.wait();

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery().catch(() => {});
      await stripKb(ctx, prompt.message_id);
      return "cancel";
    }
    const text = next.message?.text?.trim();
    if (text === undefined) {
      await next.reply("Жду название текстом или нажми «Отмена».");
      continue;
    }
    if (text === "/cancel") {
      await stripKb(ctx, prompt.message_id);
      return "cancel";
    }
    if (text.length === 0 || text.length > MAX_NAME) {
      await next.reply(`Название 1–${MAX_NAME} символов. Повтори.`);
      continue;
    }
    await stripKb(ctx, prompt.message_id);
    return text;
  }
}

async function collectPrice(
  conversation: AppConversation,
  ctx: AppContext,
  opts: { intro: string; current?: number },
): Promise<number | "cancel"> {
  const head = opts.current !== undefined ? `Текущая: ${opts.current}\n` : "";
  const prompt = await ctx.reply(head + opts.intro, { reply_markup: cancelKb() });

  while (true) {
    const next = await conversation.wait();

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery().catch(() => {});
      await stripKb(ctx, prompt.message_id);
      return "cancel";
    }
    const text = next.message?.text?.trim();
    if (text === undefined) {
      await next.reply("Жду цену числом или нажми «Отмена».");
      continue;
    }
    if (text === "/cancel") {
      await stripKb(ctx, prompt.message_id);
      return "cancel";
    }
    const parsed = Number(text.replace(/\s/g, ""));
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_PRICE) {
      await next.reply("Цена — положительное целое число (без копеек). Повтори.");
      continue;
    }
    await stripKb(ctx, prompt.message_id);
    return parsed;
  }
}

// ─── Сбор features ───────────────────────────────────────────────────────────

async function collectFeatures(
  conversation: AppConversation,
  ctx: AppContext,
  opts: { intro: string },
): Promise<string[] | "cancel"> {
  const initial = await ctx.reply(opts.intro, {
    reply_markup: new InlineKeyboard()
      .text("✅ готово (без особенностей)", "ap:fdone")
      .row()
      .text("Отмена", CB_CANCEL),
  });
  const state = { id: initial.message_id as number | undefined };

  const kb = () =>
    new InlineKeyboard()
      .text("➕ ещё особенность", "ap:fmore")
      .text("✅ готово", "ap:fdone")
      .row()
      .text("Отмена", CB_CANCEL);

  const features: string[] = [];
  while (features.length < MAX_FEATURES) {
    const next = await conversation.wait();

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery().catch(() => {});
      await upsertPrompt(ctx, state, "Отменено.", undefined);
      return "cancel";
    }

    if (next.message?.text) {
      const text = next.message.text.trim();
      if (text === "/cancel") {
        await upsertPrompt(ctx, state, "Отменено.", undefined);
        return "cancel";
      }
      if (text.length === 0 || text.length > MAX_FEATURE) {
        await next.reply(`Особенность 1–${MAX_FEATURE} символов. Повтори.`);
        continue;
      }
      features.push(text);

      if (features.length >= MAX_FEATURES) {
        await upsertPrompt(
          ctx,
          state,
          `Готово, особенностей: ${MAX_FEATURES} (максимум).`,
          undefined,
        );
        return features;
      }
      await upsertPrompt(
        ctx,
        state,
        `Особенностей: ${features.length}. Ещё или закончить?`,
        kb(),
      );
      continue;
    }

    if (next.callbackQuery?.data === "ap:fmore") {
      await next
        .answerCallbackQuery({ text: "Жду следующую особенность" })
        .catch(() => {});
      continue;
    }
    if (next.callbackQuery?.data === "ap:fdone") {
      await next.answerCallbackQuery().catch(() => {});
      await upsertPrompt(
        ctx,
        state,
        features.length === 0
          ? "Готово, без особенностей."
          : `Готово, особенностей: ${features.length}.`,
        undefined,
      );
      return features;
    }

    await next.reply("Жду текст особенности или нажми кнопку.");
  }

  await upsertPrompt(
    ctx,
    state,
    `Готово, особенностей: ${features.length}.`,
    undefined,
  );
  return features;
}

// ─── Публикация ──────────────────────────────────────────────────────────────

async function publish(
  conversation: AppConversation,
  ctx: AppContext,
  data: {
    photos: CollectedPhoto[];
    video: CollectedVideo;
    name: string;
    price: number;
    features: string[];
  },
): Promise<void> {
  const status = await ctx.reply("Сохраняю…");

  try {
    // Всё, что НЕ ctx.api-сообщения — в external (Prisma + Supabase + файлы).
    const productId = await conversation.external(async () => {
      const product = await prisma.product.create({
        data: { name: data.name, price: data.price, inStock: true },
      });
      for (let i = 0; i < data.photos.length; i++) {
        // путь без расширения — реальное (.jpg/.png/.webp) подставит upload
        const { storagePath, publicUrl } = await uploadTelegramPhotoToSupabase(
          ctx.api,
          data.photos[i].fileId,
          `products/${product.id}/${i}`,
        );
        await prisma.photo.create({
          data: {
            productId: product.id,
            storagePath,
            publicUrl,
            telegramFileId: data.photos[i].fileId,
            order: i,
            kind: data.photos[i].kind,
          },
        });
      }
      if (data.video) {
        const { storagePath, publicUrl } = await uploadTelegramPhotoToSupabase(
          ctx.api,
          data.video.fileId,
          `products/${product.id}/video`,
        );
        await prisma.product.update({
          where: { id: product.id },
          data: {
            videoStoragePath: storagePath,
            videoPublicUrl: publicUrl,
            videoTelegramFileId: data.video.fileId,
          },
        });
      }
      if (data.features.length > 0) {
        await prisma.feature.createMany({
          data: data.features.map((text, order) => ({
            productId: product.id,
            text,
            order,
          })),
        });
      }
      return product.id;
    });

    await ctx.api
      .editMessageText(
        ctx.chat!.id,
        status.message_id,
        `Опубликовано. Товар #${productId}\n${data.name} — ${data.price} ${config.currency}`,
      )
      .catch(() => {});
  } catch (e) {
    console.error("[add_product] save failed:", e);
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

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function buildCaption(name: string, price: number, features: string[]): string {
  const lines = [name, `${price} ${config.currency}`];
  if (features.length > 0) lines.push("", ...features.map((f) => `• ${f}`));
  return lines.join("\n");
}
