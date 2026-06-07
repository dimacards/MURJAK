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

function cancelOnly(): InlineKeyboard {
  return new InlineKeyboard().text("Отмена", CB_CANCEL);
}

/**
 * /add_product — пошаговый ввод товара с редактированием на превью.
 *
 * Шаги:
 *   1) фото 1..10
 *   2) название
 *   3) цена
 *   4) features (опционально)
 *   5) превью (альбом всех фото) — кнопки публикации/отмены/изменения полей.
 *
 * На любом шаге `/cancel` или кнопка «Отмена» обрывают диалог.
 */
export async function addProductConversation(
  conversation: AppConversation,
  ctx: AppContext,
): Promise<void> {
  const initialPhotos = await collectPhotos(conversation, ctx, {
    intro:
      "Добавим новый товар. Пришли первое фото (от 1 до 10 штук).\n" +
      "В любой момент: кнопка «Отмена» или /cancel — прерывают.",
  });
  if (initialPhotos === "cancel") return;

  const initialName = await collectName(conversation, ctx, {
    intro: "Название товара?",
  });
  if (initialName === "cancel") return;

  const initialPrice = await collectPrice(conversation, ctx, {
    intro: "Цена в рублях (целое число)?",
  });
  if (initialPrice === "cancel") return;

  const initialFeatures = await collectFeatures(conversation, ctx, {
    intro:
      "Теперь особенности товара (показываются только на странице товара).\n" +
      "Введи первую — одной строкой. Можно пропустить — нажми «готово».",
  });
  if (initialFeatures === "cancel") return;

  let photos = initialPhotos;
  let name = initialName;
  let price = initialPrice;
  let features = initialFeatures;

  // У предыдущего kb-сообщения превью убираем клавиатуру, чтобы стары снимок
  // состояния не отвечал на клик «Опубликовать».
  let lastKbMessageId: number | undefined;

  while (true) {
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

    if (lastKbMessageId !== undefined && ctx.chat?.id !== undefined) {
      const chatId = ctx.chat.id;
      const msgId = lastKbMessageId;
      await conversation.external(async () => {
        try {
          await ctx.api.editMessageReplyMarkup(chatId, msgId, {
            reply_markup: undefined,
          });
        } catch {
          /* безразлично */
        }
      });
    }

    // Альбом всех фото + caption на первой. Альбомы не поддерживают inline-
    // клавиатуру, поэтому кнопки идут отдельным следующим сообщением.
    const caption = buildCaption(name, price, features);
    await ctx.replyWithMediaGroup(
      photos.map((fileId, i) => ({
        type: "photo" as const,
        media: fileId,
        caption: i === 0 ? caption : undefined,
      })),
    );

    const kbMsg = await ctx.reply("Что делаем?", { reply_markup: previewKb });
    lastKbMessageId = kbMsg.message_id;

    const decision = await conversation.waitForCallbackQuery(
      /^ap:(pub|cancel|ename|eprice|ephotos|efeats)$/,
    );
    await decision.answerCallbackQuery();
    const action = decision.match?.[1];

    if (action === "cancel") {
      await tryEditText(
        conversation,
        decision,
        decision.chat?.id,
        kbMsg.message_id,
        "Добавление отменено.",
        undefined,
      );
      return;
    }

    if (action === "pub") {
      await publish(conversation, decision, kbMsg.message_id, {
        photos,
        name,
        price,
        features,
      });
      return;
    }

    if (action === "ename") {
      await tryEditText(
        conversation,
        decision,
        decision.chat?.id,
        kbMsg.message_id,
        "Меняем название…",
        undefined,
      );
      const result = await collectName(conversation, ctx, {
        intro: "Новое название?",
        current: name,
      });
      if (result !== "cancel") name = result;
      continue;
    }
    if (action === "eprice") {
      await tryEditText(
        conversation,
        decision,
        decision.chat?.id,
        kbMsg.message_id,
        "Меняем цену…",
        undefined,
      );
      const result = await collectPrice(conversation, ctx, {
        intro: "Новая цена?",
        current: price,
      });
      if (result !== "cancel") price = result;
      continue;
    }
    if (action === "ephotos") {
      await tryEditText(
        conversation,
        decision,
        decision.chat?.id,
        kbMsg.message_id,
        "Меняем фото…",
        undefined,
      );
      const result = await collectPhotos(conversation, ctx, {
        intro:
          `Сейчас ${photos.length} фото. Пришли новые (1-10) — старые ` +
          `заменятся целиком. На «отмену» прежние сохранятся.`,
      });
      if (result !== "cancel") photos = result;
      continue;
    }
    if (action === "efeats") {
      await tryEditText(
        conversation,
        decision,
        decision.chat?.id,
        kbMsg.message_id,
        "Меняем особенности…",
        undefined,
      );
      const result = await collectFeatures(conversation, ctx, {
        intro:
          features.length > 0
            ? `Текущие особенности (${features.length}) будут заменены. ` +
              "Введи первую новую или нажми «готово (без особенностей)».\n" +
              "Нажми «отмена», чтобы оставить старые."
            : "Введи первую особенность или нажми «готово».",
      });
      if (result !== "cancel") features = result;
      continue;
    }
  }
}

// ─── Helpers: edit/reply через conversation.external ─────────────────────────

/**
 * Редактирует существующее сообщение или, если не вышло, шлёт новое.
 * Все API-вызовы обёрнуты в conversation.external, чтобы при ре-плее
 * (на serverless каждый webhook — replay) не повторяться и не падать в
 * «message is not modified» / «can't be edited» / «not found» — эти ошибки
 * безвредно игнорируем.
 */
async function setPrompt(
  conversation: AppConversation,
  ctx: AppContext,
  state: { id: number | undefined },
  text: string,
  kb: InlineKeyboard | undefined,
): Promise<void> {
  const chatId = ctx.chat?.id;

  if (state.id !== undefined && chatId !== undefined) {
    const currentId = state.id;
    const ok = await conversation.external(async () => {
      try {
        await ctx.api.editMessageText(chatId, currentId, text, {
          reply_markup: kb,
        });
        return true;
      } catch (e) {
        return isBenignEditError(e);
      }
    });
    if (ok) return;
    state.id = undefined;
  }

  const sent = await ctx.reply(text, { reply_markup: kb });
  state.id = sent.message_id;
}

/**
 * Просто пытается отредактировать сообщение по ID. Ошибки глотает.
 * Используется когда мы знаем messageId но НЕ хотим fallback в reply
 * (например, гасим клавиатуру у старого превью).
 */
async function tryEditText(
  conversation: AppConversation,
  ctx: AppContext,
  chatId: number | undefined,
  messageId: number,
  text: string,
  kb: InlineKeyboard | undefined,
): Promise<void> {
  if (chatId === undefined) return;
  await conversation.external(async () => {
    try {
      await ctx.api.editMessageText(chatId, messageId, text, {
        reply_markup: kb,
      });
    } catch (e) {
      if (!isBenignEditError(e)) {
        console.warn("[add_product] edit text failed:", (e as Error)?.message);
      }
    }
  });
}

function isBenignEditError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? "").toLowerCase();
  return (
    msg.includes("not modified") ||
    msg.includes("message to edit not found") ||
    msg.includes("message can't be edited") ||
    msg.includes("message_id_invalid")
  );
}

// ─── Сбор фото ───────────────────────────────────────────────────────────────

async function collectPhotos(
  conversation: AppConversation,
  ctx: AppContext,
  opts: { intro: string },
): Promise<string[] | "cancel"> {
  const initial = await ctx.reply(opts.intro, { reply_markup: cancelOnly() });
  const state = { id: initial.message_id as number | undefined };

  const photoKb = () =>
    new InlineKeyboard()
      .text("➕ ещё фото", "ap:pmore")
      .text("✅ готово", "ap:pdone")
      .row()
      .text("Отмена", CB_CANCEL);

  const photoFileIds: string[] = [];
  while (photoFileIds.length < MAX_PHOTOS) {
    const next = await conversation.wait();

    if (next.message?.text?.trim() === "/cancel") {
      await setPrompt(conversation, ctx, state, "Отменено.", undefined);
      return "cancel";
    }

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery();
      await setPrompt(conversation, ctx, state, "Отменено.", undefined);
      return "cancel";
    }

    if (next.message?.photo) {
      const sizes = next.message.photo;
      const best = sizes[sizes.length - 1];
      photoFileIds.push(best.file_id);

      if (photoFileIds.length >= MAX_PHOTOS) {
        await setPrompt(
          conversation,
          ctx,
          state,
          `Готово, добавлено ${MAX_PHOTOS} фото.`,
          undefined,
        );
        return photoFileIds;
      }

      await setPrompt(
        conversation,
        ctx,
        state,
        `Фото ${photoFileIds.length}/${MAX_PHOTOS}. Добавить ещё или закончить?`,
        photoKb(),
      );
      continue;
    }

    if (next.callbackQuery?.data === "ap:pdone") {
      await next.answerCallbackQuery();
      if (photoFileIds.length === 0) {
        await setPrompt(
          conversation,
          ctx,
          state,
          "Нужно хотя бы одно фото. Пришли его или нажми «Отмена».",
          new InlineKeyboard().text("Отмена", CB_CANCEL),
        );
        continue;
      }
      await setPrompt(
        conversation,
        ctx,
        state,
        `Готово, добавлено ${photoFileIds.length} фото.`,
        undefined,
      );
      return photoFileIds;
    }

    if (next.callbackQuery?.data === "ap:pmore") {
      await next.answerCallbackQuery({ text: "Жду фото" });
      continue;
    }

    await next.reply("Жду фото или нажми кнопку.");
  }

  await setPrompt(
    conversation,
    ctx,
    state,
    `Готово, добавлено ${photoFileIds.length} фото.`,
    undefined,
  );
  return photoFileIds;
}

// ─── Сбор названия / цены ────────────────────────────────────────────────────

async function collectName(
  conversation: AppConversation,
  ctx: AppContext,
  opts: { intro: string; current?: string },
): Promise<string | "cancel"> {
  const head = opts.current ? `Текущее: «${opts.current}»\n` : "";
  const prompt = await ctx.reply(head + opts.intro, {
    reply_markup: cancelOnly(),
  });

  while (true) {
    const next = await conversation.wait();

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery();
      await stripKeyboard(conversation, ctx, prompt.message_id);
      return "cancel";
    }

    const text = next.message?.text?.trim();
    if (text === undefined) {
      await next.reply("Жду название текстом или нажми «Отмена».");
      continue;
    }
    if (text === "/cancel") {
      await stripKeyboard(conversation, ctx, prompt.message_id);
      return "cancel";
    }
    if (text.length === 0 || text.length > MAX_NAME) {
      await next.reply(`Название 1–${MAX_NAME} символов. Повтори.`);
      continue;
    }
    await stripKeyboard(conversation, ctx, prompt.message_id);
    return text;
  }
}

async function collectPrice(
  conversation: AppConversation,
  ctx: AppContext,
  opts: { intro: string; current?: number },
): Promise<number | "cancel"> {
  const head =
    opts.current !== undefined ? `Текущая: ${opts.current}\n` : "";
  const prompt = await ctx.reply(head + opts.intro, {
    reply_markup: cancelOnly(),
  });

  while (true) {
    const next = await conversation.wait();

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery();
      await stripKeyboard(conversation, ctx, prompt.message_id);
      return "cancel";
    }

    const text = next.message?.text?.trim();
    if (text === undefined) {
      await next.reply("Жду цену числом или нажми «Отмена».");
      continue;
    }
    if (text === "/cancel") {
      await stripKeyboard(conversation, ctx, prompt.message_id);
      return "cancel";
    }
    const parsed = Number(text.replace(/\s/g, ""));
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_PRICE) {
      await next.reply(
        "Цена должна быть положительным целым числом (без копеек). Повтори.",
      );
      continue;
    }
    await stripKeyboard(conversation, ctx, prompt.message_id);
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

  const featKb = () =>
    new InlineKeyboard()
      .text("➕ ещё особенность", "ap:fmore")
      .text("✅ готово", "ap:fdone")
      .row()
      .text("Отмена", CB_CANCEL);

  const features: string[] = [];
  while (features.length < MAX_FEATURES) {
    const next = await conversation.wait();

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery();
      await setPrompt(conversation, ctx, state, "Отменено.", undefined);
      return "cancel";
    }

    if (next.message?.text) {
      const text = next.message.text.trim();
      if (text === "/cancel") {
        await setPrompt(conversation, ctx, state, "Отменено.", undefined);
        return "cancel";
      }
      if (text.length === 0 || text.length > MAX_FEATURE) {
        await next.reply(`Особенность 1–${MAX_FEATURE} символов. Повтори.`);
        continue;
      }
      features.push(text);

      if (features.length >= MAX_FEATURES) {
        await setPrompt(
          conversation,
          ctx,
          state,
          `Готово, особенностей: ${MAX_FEATURES} (максимум).`,
          undefined,
        );
        return features;
      }

      await setPrompt(
        conversation,
        ctx,
        state,
        `Особенностей: ${features.length}. Ещё или закончить?`,
        featKb(),
      );
      continue;
    }

    if (next.callbackQuery?.data === "ap:fmore") {
      await next.answerCallbackQuery({ text: "Жду следующую особенность" });
      continue;
    }

    if (next.callbackQuery?.data === "ap:fdone") {
      await next.answerCallbackQuery();
      await setPrompt(
        conversation,
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

  await setPrompt(
    conversation,
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
  kbMessageId: number,
  data: { photos: string[]; name: string; price: number; features: string[] },
): Promise<void> {
  await tryEditText(
    conversation,
    ctx,
    ctx.chat?.id,
    kbMessageId,
    "Сохраняю…",
    undefined,
  );

  try {
    const productId = await conversation.external(async () => {
      const product = await prisma.product.create({
        data: { name: data.name, price: data.price, inStock: true },
      });

      for (let i = 0; i < data.photos.length; i++) {
        const fileId = data.photos[i];
        const storagePath = `products/${product.id}/${i}.jpg`;
        const { publicUrl } = await uploadTelegramPhotoToSupabase(
          ctx.api,
          fileId,
          storagePath,
        );
        await prisma.photo.create({
          data: {
            productId: product.id,
            storagePath,
            publicUrl,
            telegramFileId: fileId,
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

    await tryEditText(
      conversation,
      ctx,
      ctx.chat?.id,
      kbMessageId,
      `Опубликовано. Товар #${productId}\n${data.name} — ${data.price} ${config.currency}`,
      undefined,
    );
  } catch (e) {
    console.error("[add_product] save failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    await tryEditText(
      conversation,
      ctx,
      ctx.chat?.id,
      kbMessageId,
      `Не получилось сохранить: ${msg}`,
      undefined,
    );
  }
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function buildCaption(
  name: string,
  price: number,
  features: string[],
): string {
  const lines = [name, `${price} ${config.currency}`];
  if (features.length > 0) {
    lines.push("", ...features.map((f) => `• ${f}`));
  }
  return lines.join("\n");
}

async function stripKeyboard(
  conversation: AppConversation,
  ctx: AppContext,
  messageId: number,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return;
  await conversation.external(async () => {
    try {
      await ctx.api.editMessageReplyMarkup(chatId, messageId, {
        reply_markup: undefined,
      });
    } catch {
      /* безразлично */
    }
  });
}
