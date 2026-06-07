import { InlineKeyboard } from "grammy";
import type { AppContext, AppConversation } from "../types";
import { prisma } from "../../db";
import config from "../../config";
import { uploadTelegramPhotoToSupabase } from "../upload";

const MAX_PHOTOS = 10;
const MAX_NAME = 200;
const MAX_FEATURE = 200;
const MAX_FEATURES = 20;
const MAX_PRICE = 100_000_000;

const CB_CANCEL = "ap:cancel";

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
async function stripKb(ctx: AppContext, messageId: number): Promise<void> {
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
 * /add_product — пошаговый ввод товара с редактированием на превью.
 */
export async function addProductConversation(
  conversation: AppConversation,
  ctx: AppContext,
): Promise<void> {
  const photos0 = await collectPhotos(conversation, ctx, {
    intro:
      "Добавим новый товар. Пришли фото (от 1 до 10 штук).\n" +
      "Кнопка «Отмена» или /cancel — прерывают.",
  });
  if (photos0 === "cancel") return;

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
  let name = name0;
  let price = price0;
  let features = features0;

  let lastKbMsgId: number | undefined;

  while (true) {
    if (lastKbMsgId !== undefined) await stripKb(ctx, lastKbMsgId);

    // Альбом всех фото (caption на первом) + отдельное сообщение с кнопками
    // (у media group своей клавиатуры быть не может).
    const caption = buildCaption(name, price, features);
    await ctx.replyWithMediaGroup(
      photos.map((fileId, i) => ({
        type: "photo" as const,
        media: fileId,
        caption: i === 0 ? caption : undefined,
      })),
    );

    const previewKb = new InlineKeyboard()
      .text("✅ Опубликовать", "ap:pub")
      .row()
      .text("📝 Название", "ap:ename")
      .text("💰 Цена", "ap:eprice")
      .row()
      .text("🖼 Фото", "ap:ephotos")
      .text("⭐ Особенности", "ap:efeats")
      .row()
      .text("Отмена", CB_CANCEL);

    const kbMsg = await ctx.reply("Что делаем?", { reply_markup: previewKb });
    lastKbMsgId = kbMsg.message_id;

    const dec = await conversation.waitForCallbackQuery(
      /^ap:(pub|cancel|ename|eprice|ephotos|efeats)$/,
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
      await publish(conversation, ctx, { photos, name, price, features });
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
      const r = await collectPhotos(conversation, ctx, {
        intro: `Сейчас ${photos.length} фото. Пришли новые (старые заменятся).`,
      });
      if (r !== "cancel") photos = r;
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

// ─── Сбор фото ───────────────────────────────────────────────────────────────

async function collectPhotos(
  conversation: AppConversation,
  ctx: AppContext,
  opts: { intro: string },
): Promise<string[] | "cancel"> {
  const initial = await ctx.reply(opts.intro, { reply_markup: cancelKb() });
  const state = { id: initial.message_id as number | undefined };

  const kb = () =>
    new InlineKeyboard()
      .text("➕ ещё фото", "ap:pmore")
      .text("✅ готово", "ap:pdone")
      .row()
      .text("Отмена", CB_CANCEL);

  // Per-batch: внутри одного альбома (общий media_group_id) обновляем ОДНО
  // сообщение счётчиком. Новый альбом или отдельно присланное фото — НОВОЕ
  // сообщение. Одиночные фото (без media_group_id) каждое = своя порция.
  let batchKey: string | undefined;
  let batchCount = 0;

  const ids: string[] = [];
  while (ids.length < MAX_PHOTOS) {
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

    if (next.message?.photo) {
      const sizes = next.message.photo;
      ids.push(sizes[sizes.length - 1].file_id);

      const mgi = next.message.media_group_id;
      const isNewBatch =
        mgi === undefined || batchKey === undefined || mgi !== batchKey;
      if (isNewBatch) {
        // Снимаем кнопки со старого сообщения-порции и заставляем upsertPrompt
        // отправить НОВОЕ (state.id = undefined).
        if (state.id !== undefined && batchCount > 0) {
          await stripKb(ctx, state.id);
        }
        state.id = undefined;
        batchKey = mgi;
        batchCount = 0;
      }
      batchCount++;

      if (ids.length >= MAX_PHOTOS) {
        await upsertPrompt(
          ctx,
          state,
          `Готово, добавлено ${MAX_PHOTOS} фото.`,
          undefined,
        );
        return ids;
      }
      const suffix =
        batchCount === ids.length ? "" : ` (всего ${ids.length}/${MAX_PHOTOS})`;
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
  data: { photos: string[]; name: string; price: number; features: string[] },
): Promise<void> {
  const status = await ctx.reply("Сохраняю…");

  try {
    // Всё, что НЕ ctx.api — в external (Prisma + Supabase + загрузка файлов).
    // getFile внутри upload — one-shot, выполняется один раз (external кэширует).
    const productId = await conversation.external(async () => {
      const product = await prisma.product.create({
        data: { name: data.name, price: data.price, inStock: true },
      });
      for (let i = 0; i < data.photos.length; i++) {
        const storagePath = `products/${product.id}/${i}.jpg`;
        const { publicUrl } = await uploadTelegramPhotoToSupabase(
          ctx.api,
          data.photos[i],
          storagePath,
        );
        await prisma.photo.create({
          data: {
            productId: product.id,
            storagePath,
            publicUrl,
            telegramFileId: data.photos[i],
            order: i,
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
