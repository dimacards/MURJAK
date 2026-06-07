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
  return new InlineKeyboard().text("❌ Отмена", CB_CANCEL);
}

/**
 * /add_product — пошаговый ввод товара с возможностью редактировать на превью.
 *
 * Шаги:
 *   1) фото 1..10
 *   2) название
 *   3) цена
 *   4) features (опционально)
 *   5) превью — кнопки публикации, отмены и изменения каждого поля.
 *      После изменения превью пересобирается, можно править снова.
 *
 * На любом шаге `/cancel` или кнопка отмены обрывают диалог.
 */
export async function addProductConversation(
  conversation: AppConversation,
  ctx: AppContext,
): Promise<void> {
  // ── Сбор начальных значений ─────────────────────────────────────────────
  const initialPhotos = await collectPhotos(conversation, ctx, {
    intro:
      "Добавим новый товар. Пришли первое фото (от 1 до 10 штук).\n" +
      "На любом шаге кнопка «❌ Отмена» или /cancel прерывают.",
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

  // ── Превью + цикл редактирования ────────────────────────────────────────
  let photos = initialPhotos;
  let name = initialName;
  let price = initialPrice;
  let features = initialFeatures;

  // ID последнего превью-сообщения — у предыдущего гасим кнопки, чтобы не
  // вышло ситуации, когда юзер несколько раз нажал «Опубликовать» на разных
  // превью подряд (старые ещё в чате, но больше не активны).
  let lastPreviewMessageId: number | undefined;

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
      .text("❌ Отмена", CB_CANCEL);

    // у предыдущего превью убираем клавиатуру, чтобы было невозможно
    // случайно «Опубликовать» прошлый снимок состояния.
    if (lastPreviewMessageId !== undefined && ctx.chat?.id !== undefined) {
      await ctx.api
        .editMessageReplyMarkup(ctx.chat.id, lastPreviewMessageId, {
          reply_markup: undefined,
        })
        .catch(() => {});
    }

    const caption = buildCaption(name, price, features);
    const sent = await ctx.replyWithPhoto(photos[0], {
      caption,
      reply_markup: previewKb,
    });
    lastPreviewMessageId = sent.message_id;

    const decision = await conversation.waitForCallbackQuery(
      /^ap:(pub|cancel|ename|eprice|ephotos|efeats)$/,
    );
    await decision.answerCallbackQuery();
    const action = decision.match?.[1];

    if (action === "cancel") {
      await decision
        .editMessageCaption({ caption: "Добавление отменено." })
        .catch(() => {});
      return;
    }

    if (action === "pub") {
      await publish(conversation, decision, {
        photos,
        name,
        price,
        features,
      });
      return;
    }

    if (action === "ename") {
      const result = await collectName(conversation, ctx, {
        intro: "Новое название?",
        current: name,
      });
      if (result !== "cancel") name = result;
      continue;
    }
    if (action === "eprice") {
      const result = await collectPrice(conversation, ctx, {
        intro: "Новая цена?",
        current: price,
      });
      if (result !== "cancel") price = result;
      continue;
    }
    if (action === "ephotos") {
      const result = await collectPhotos(conversation, ctx, {
        intro:
          `Сейчас ${photos.length} фото. Пришли новые (1-10) — старые ` +
          `заменятся целиком. На «отмену» прежние сохранятся.`,
      });
      if (result !== "cancel") photos = result;
      continue;
    }
    if (action === "efeats") {
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

// ─────────────────────────────────────────────────────────────────────────────
// Сбор фото
// ─────────────────────────────────────────────────────────────────────────────

async function collectPhotos(
  conversation: AppConversation,
  ctx: AppContext,
  opts: { intro: string },
): Promise<string[] | "cancel"> {
  const initial = await ctx.reply(opts.intro, { reply_markup: cancelOnly() });
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

  const photoKb = () =>
    new InlineKeyboard()
      .text("➕ ещё фото", "ap:pmore")
      .text("✅ готово", "ap:pdone")
      .row()
      .text("❌ Отмена", CB_CANCEL);

  const photoFileIds: string[] = [];
  while (photoFileIds.length < MAX_PHOTOS) {
    const next = await conversation.wait();

    if (next.message?.text?.trim() === "/cancel") {
      await showPrompt("Отменено.", undefined);
      return "cancel";
    }

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery();
      await showPrompt("Отменено.", undefined);
      return "cancel";
    }

    if (next.message?.photo) {
      const sizes = next.message.photo;
      const best = sizes[sizes.length - 1];
      photoFileIds.push(best.file_id);

      if (photoFileIds.length >= MAX_PHOTOS) {
        // финализируем подсказку перед выходом из цикла
        await showPrompt(`Готово, добавлено ${MAX_PHOTOS} фото.`, undefined);
        return photoFileIds;
      }

      await showPrompt(
        `Фото ${photoFileIds.length}/${MAX_PHOTOS}. Добавить ещё или закончить?`,
        photoKb(),
      );
      continue;
    }

    if (next.callbackQuery?.data === "ap:pdone") {
      await next.answerCallbackQuery();
      if (photoFileIds.length === 0) {
        await showPrompt(
          "Нужно хотя бы одно фото. Пришли его или нажми отмену.",
          new InlineKeyboard().text("❌ Отмена", CB_CANCEL),
        );
        continue;
      }
      // финализируем подсказку отдельным сообщением «итог»
      await showPrompt(
        `Готово, добавлено ${photoFileIds.length} ${photoWord(photoFileIds.length)}.`,
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

  await showPrompt(`Готово, добавлено ${photoFileIds.length} фото.`, undefined);
  return photoFileIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// Сбор названия / цены / features
// ─────────────────────────────────────────────────────────────────────────────

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
      await removeKeyboard(ctx, prompt.message_id);
      return "cancel";
    }

    const text = next.message?.text?.trim();
    if (text === undefined) {
      await next.reply("Жду название текстом или нажми отмену.");
      continue;
    }
    if (text === "/cancel") {
      await removeKeyboard(ctx, prompt.message_id);
      return "cancel";
    }
    if (text.length === 0 || text.length > MAX_NAME) {
      await next.reply(`Название 1–${MAX_NAME} символов. Повтори.`);
      continue;
    }
    await removeKeyboard(ctx, prompt.message_id);
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
      await removeKeyboard(ctx, prompt.message_id);
      return "cancel";
    }

    const text = next.message?.text?.trim();
    if (text === undefined) {
      await next.reply("Жду цену числом или нажми отмену.");
      continue;
    }
    if (text === "/cancel") {
      await removeKeyboard(ctx, prompt.message_id);
      return "cancel";
    }
    // допускаем пробелы как разделители тысяч: «12 000» → 12000
    const parsed = Number(text.replace(/\s/g, ""));
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_PRICE) {
      await next.reply(
        "Цена должна быть положительным целым числом (без копеек). Повтори.",
      );
      continue;
    }
    await removeKeyboard(ctx, prompt.message_id);
    return parsed;
  }
}

async function collectFeatures(
  conversation: AppConversation,
  ctx: AppContext,
  opts: { intro: string },
): Promise<string[] | "cancel"> {
  const initial = await ctx.reply(opts.intro, {
    reply_markup: new InlineKeyboard()
      .text("✅ готово (без особенностей)", "ap:fdone")
      .row()
      .text("❌ Отмена", CB_CANCEL),
  });

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

  const featKb = () =>
    new InlineKeyboard()
      .text("➕ ещё особенность", "ap:fmore")
      .text("✅ готово", "ap:fdone")
      .row()
      .text("❌ Отмена", CB_CANCEL);

  const features: string[] = [];
  while (features.length < MAX_FEATURES) {
    const next = await conversation.wait();

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery();
      await showPrompt("Отменено.", undefined);
      return "cancel";
    }

    if (next.message?.text) {
      const text = next.message.text.trim();
      if (text === "/cancel") {
        await showPrompt("Отменено.", undefined);
        return "cancel";
      }
      if (text.length === 0 || text.length > MAX_FEATURE) {
        await next.reply(`Особенность 1–${MAX_FEATURE} символов. Повтори.`);
        continue;
      }
      features.push(text);

      if (features.length >= MAX_FEATURES) {
        await showPrompt(
          `Готово, особенностей: ${MAX_FEATURES} (максимум).`,
          undefined,
        );
        return features;
      }

      await showPrompt(
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
      await showPrompt(
        features.length === 0
          ? "Готово, без особенностей."
          : `Готово, особенностей: ${features.length}.`,
        undefined,
      );
      return features;
    }

    await next.reply("Жду текст особенности или нажми кнопку.");
  }

  await showPrompt(`Готово, особенностей: ${features.length}.`, undefined);
  return features;
}

// ─────────────────────────────────────────────────────────────────────────────
// Публикация: запись Product + Photo + Feature, загрузка в Storage
// ─────────────────────────────────────────────────────────────────────────────

async function publish(
  conversation: AppConversation,
  ctx: AppContext,
  data: { photos: string[]; name: string; price: number; features: string[] },
): Promise<void> {
  await ctx.editMessageCaption({ caption: "Сохраняю..." }).catch(() => {});

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

    await ctx
      .editMessageCaption({
        caption: `✅ Опубликовано! Товар #${productId}\n${data.name} — ${data.price} ${config.currency}`,
      })
      .catch(() => {});
  } catch (e) {
    console.error("[add_product] save failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    await ctx
      .editMessageCaption({ caption: `❌ Не получилось сохранить: ${msg}` })
      .catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Утилиты
// ─────────────────────────────────────────────────────────────────────────────

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

function photoWord(n: number): string {
  // согласование «фото» — всегда несклоняемое, оставляем «фото»
  // (метка нужна только если когда-то заменим на «снимок»)
  return n === 1 ? "фото" : "фото";
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
