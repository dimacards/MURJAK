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

/** Только-кнопка-отмены — используется на шагах с текстовым вводом. */
function cancelOnly(): InlineKeyboard {
  return new InlineKeyboard().text("❌ Отмена", CB_CANCEL);
}

/** Кнопки для шага фото: ещё/готово + отмена отдельной строкой. */
function photoKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ ещё фото", "ap:pmore")
    .text("✅ готово", "ap:pdone")
    .row()
    .text("❌ Отмена", CB_CANCEL);
}

/** Кнопки для шага features. */
function featKb(): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ ещё особенность", "ap:fmore")
    .text("✅ готово", "ap:fdone")
    .row()
    .text("❌ Отмена", CB_CANCEL);
}

/**
 * /add_product — пошаговый ввод товара.
 *
 * Шаги:
 *   1) фото 1..10 (после каждого: «ещё фото» / «готово» / «отмена»)
 *   2) название (текст; кнопка «отмена»)
 *   3) цена (целое число рублей; кнопка «отмена»)
 *   4) features по одной (после каждой: «ещё» / «готово» / «отмена»)
 *   5) превью + «Опубликовать» / «Отмена»
 *
 * На любом шаге `/cancel` или кнопка отмены обрывают диалог.
 */
export async function addProductConversation(
  conversation: AppConversation,
  ctx: AppContext,
): Promise<void> {
  // ── Шаг 1: фото ─────────────────────────────────────────────────────────
  const initial = await ctx.reply(
    "Добавим новый товар. Пришли первое фото (1-10 штук).",
    { reply_markup: cancelOnly() },
  );
  // Один прогресс-месседж, который перезаписываем по мере поступления фото.
  // Без этого альбом из 5 фото породил бы 5 одинаковых ответов бота.
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
        // юзер удалил сообщение — перешлём заново
        promptMessageId = undefined;
      }
    }
    const sent = await ctx.reply(text, { reply_markup: kb });
    promptMessageId = sent.message_id;
  };

  const photoFileIds: string[] = [];
  while (photoFileIds.length < MAX_PHOTOS) {
    const next = await conversation.wait();

    if (next.message?.text?.trim() === "/cancel") {
      await next.reply("Добавление отменено.");
      return;
    }

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery();
      await showPrompt("Добавление отменено.", undefined);
      return;
    }

    if (next.message?.photo) {
      const sizes = next.message.photo;
      const best = sizes[sizes.length - 1];
      photoFileIds.push(best.file_id);

      if (photoFileIds.length >= MAX_PHOTOS) {
        await showPrompt(
          `${MAX_PHOTOS}/${MAX_PHOTOS} — максимум. Переходим к названию.`,
          undefined,
        );
        break;
      }

      await showPrompt(
        `Фото ${photoFileIds.length}/${MAX_PHOTOS}. Добавить ещё или закончить?`,
        photoKb(),
      );
      continue;
    }

    if (next.callbackQuery?.data === "ap:pdone") {
      await next.answerCallbackQuery();
      break;
    }

    if (next.callbackQuery?.data === "ap:pmore") {
      await next.answerCallbackQuery({ text: "Жду фото" });
      continue;
    }

    await next.reply("Жду фото или нажми кнопку.");
  }

  if (photoFileIds.length === 0) {
    await ctx.reply("Без фото товар не сохранить. Отменено.");
    return;
  }

  // ── Шаг 2: название ─────────────────────────────────────────────────────
  const nameMsg = await ctx.reply("Название товара?", {
    reply_markup: cancelOnly(),
  });
  let name = "";
  while (true) {
    const next = await conversation.wait();

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery();
      await removeKeyboard(ctx, nameMsg.message_id);
      await ctx.reply("Добавление отменено.");
      return;
    }

    const text = next.message?.text?.trim();
    if (text === undefined) {
      await next.reply("Жду название текстом или нажми отмену.");
      continue;
    }
    if (text === "/cancel") {
      await removeKeyboard(ctx, nameMsg.message_id);
      await next.reply("Добавление отменено.");
      return;
    }
    if (text.length === 0 || text.length > MAX_NAME) {
      await next.reply(
        `Название должно быть от 1 до ${MAX_NAME} символов. Повтори.`,
      );
      continue;
    }
    name = text;
    await removeKeyboard(ctx, nameMsg.message_id);
    break;
  }

  // ── Шаг 3: цена ──────────────────────────────────────────────────────────
  const priceMsg = await ctx.reply("Цена в рублях (целое число)?", {
    reply_markup: cancelOnly(),
  });
  let price = 0;
  while (true) {
    const next = await conversation.wait();

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery();
      await removeKeyboard(ctx, priceMsg.message_id);
      await ctx.reply("Добавление отменено.");
      return;
    }

    const text = next.message?.text?.trim();
    if (text === undefined) {
      await next.reply("Жду цену числом или нажми отмену.");
      continue;
    }
    if (text === "/cancel") {
      await removeKeyboard(ctx, priceMsg.message_id);
      await next.reply("Добавление отменено.");
      return;
    }
    // допускаем пробелы как разделители тысяч: «12 000» → 12000
    const parsed = Number(text.replace(/\s/g, ""));
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_PRICE) {
      await next.reply(
        "Цена должна быть положительным целым числом (без копеек). Повтори.",
      );
      continue;
    }
    price = parsed;
    await removeKeyboard(ctx, priceMsg.message_id);
    break;
  }

  // ── Шаг 4: features ─────────────────────────────────────────────────────
  const featInitial = await ctx.reply(
    "Теперь особенности товара (показываются только на странице товара, " +
      "не в общей сетке). Введи первую — одной строкой.\n" +
      "Можно пропустить — нажми «готово».",
    {
      reply_markup: new InlineKeyboard()
        .text("✅ готово (без особенностей)", "ap:fdone")
        .row()
        .text("❌ Отмена", CB_CANCEL),
    },
  );
  let featPromptId: number | undefined = featInitial.message_id;
  const showFeatPrompt = async (
    text: string,
    kb: InlineKeyboard | undefined,
  ) => {
    const chatId = ctx.chat?.id;
    if (featPromptId !== undefined && chatId !== undefined) {
      try {
        await ctx.api.editMessageText(chatId, featPromptId, text, {
          reply_markup: kb,
        });
        return;
      } catch {
        featPromptId = undefined;
      }
    }
    const sent = await ctx.reply(text, { reply_markup: kb });
    featPromptId = sent.message_id;
  };

  const features: string[] = [];
  while (features.length < MAX_FEATURES) {
    const next = await conversation.wait();

    if (next.callbackQuery?.data === CB_CANCEL) {
      await next.answerCallbackQuery();
      await showFeatPrompt("Добавление отменено.", undefined);
      return;
    }

    if (next.message?.text) {
      const text = next.message.text.trim();
      if (text === "/cancel") {
        await next.reply("Добавление отменено.");
        return;
      }
      if (text.length === 0 || text.length > MAX_FEATURE) {
        await next.reply(`Особенность 1–${MAX_FEATURE} символов. Повтори.`);
        continue;
      }
      features.push(text);

      if (features.length >= MAX_FEATURES) {
        await showFeatPrompt(
          `${MAX_FEATURES} — максимум. Переходим к превью.`,
          undefined,
        );
        break;
      }

      await showFeatPrompt(
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
      break;
    }

    await next.reply("Жду текст особенности или нажми кнопку.");
  }

  // ── Шаг 5: превью + публикация ──────────────────────────────────────────
  const previewLines = [name, `${price} ${config.currency}`];
  if (features.length > 0) {
    previewLines.push("", ...features.map((f) => `• ${f}`));
  }
  const previewCaption = previewLines.join("\n");

  const confirmKb = new InlineKeyboard()
    .text("✅ Опубликовать", "ap:pub")
    .text("❌ Отмена", CB_CANCEL);

  await ctx.replyWithPhoto(photoFileIds[0], {
    caption: previewCaption,
    reply_markup: confirmKb,
  });

  const decision = await conversation.waitForCallbackQuery(/^ap:(pub|cancel)$/);
  await decision.answerCallbackQuery();
  const action = decision.match?.[1];

  if (action === "cancel") {
    await decision
      .editMessageCaption({ caption: "Добавление отменено." })
      .catch(() => {});
    return;
  }

  await decision
    .editMessageCaption({ caption: "Сохраняю..." })
    .catch(() => {});

  try {
    const productId = await conversation.external(async () => {
      const product = await prisma.product.create({
        data: { name, price, inStock: true },
      });

      for (let i = 0; i < photoFileIds.length; i++) {
        const fileId = photoFileIds[i];
        const storagePath = `products/${product.id}/${i}.jpg`;
        const { publicUrl } = await uploadTelegramPhotoToSupabase(
          decision.api,
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

      if (features.length > 0) {
        await prisma.feature.createMany({
          data: features.map((text, order) => ({
            productId: product.id,
            text,
            order,
          })),
        });
      }

      return product.id;
    });

    await decision
      .editMessageCaption({
        caption: `✅ Опубликовано! Товар #${productId}\n${name} — ${price} ${config.currency}`,
      })
      .catch(() => {});
  } catch (e) {
    console.error("[add_product] save failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    await decision
      .editMessageCaption({ caption: `❌ Не получилось сохранить: ${msg}` })
      .catch(() => {});
  }
}

/** Снять inline-клавиатуру с сообщения; ошибки молча проглатываем. */
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
