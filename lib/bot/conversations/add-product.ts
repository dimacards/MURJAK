import { InlineKeyboard } from "grammy";
import type { AppContext, AppConversation } from "../types";
import { prisma } from "../../db";
import config from "../../config";
import { uploadTelegramPhotoToSupabase } from "../upload";

const MAX_PHOTOS = 10;
const MAX_NAME = 200;
const MAX_FEATURE = 200;
const MAX_FEATURES = 20; // защита от случайного спама
const MAX_PRICE = 100_000_000; // ~100 млн ₽ — практический потолок

/**
 * /add_product — пошаговый ввод товара.
 *
 * Шаги:
 *   1) фото 1..10 (после каждого: «ещё фото» / «готово»)
 *   2) название (текстом, 1..200 символов)
 *   3) цена (целое число рублей, > 0)
 *   4) features по одной (после каждой: «ещё особенность» / «готово»)
 *   5) превью (фото + название + цена + features) + «Опубликовать» / «Отмена»
 *
 * На любом шаге `/cancel` отменяет диалог.
 * При публикации:
 *   - создаём Product
 *   - заливаем фото в Supabase Storage и создаём Photo-записи
 *   - создаём Feature-записи в порядке ввода
 *
 * Транзакции вокруг этого нет: Supabase upload не часть Prisma-транзакции.
 * При сбое посередине товар может остаться без части фото — переживу,
 * на этапе 5 будет редактирование, починим вручную.
 */
export async function addProductConversation(
  conversation: AppConversation,
  ctx: AppContext,
): Promise<void> {
  // ── Шаг 1: фото ─────────────────────────────────────────────────────────
  await ctx.reply(
    "Добавим новый товар. Сначала фото — пришли первое (от 1 до 10 штук).\n" +
      "Команда /cancel в любой момент отменяет добавление.",
  );

  const photoFileIds: string[] = [];
  // Один прогресс-месседж с кнопками, который перезаписываем по мере поступления
  // новых фото. Иначе на альбом из 5 фото бот бы выдал 5 одинаковых сообщений.
  let promptMessageId: number | undefined;

  // Утилита: показать/обновить прогресс. Если сообщение уже есть — editText,
  // иначе reply. При фейле edit'а (например, юзер удалил сообщение) — fallback
  // на новое reply.
  const showPrompt = async (text: string, withKb: boolean) => {
    const kb = withKb
      ? new InlineKeyboard()
          .text("➕ ещё фото", "ap:pmore")
          .text("✅ готово", "ap:pdone")
      : undefined;
    const chatId = ctx.chat?.id;
    if (promptMessageId !== undefined && chatId !== undefined) {
      try {
        await ctx.api.editMessageText(chatId, promptMessageId, text, {
          reply_markup: kb,
        });
        return;
      } catch {
        // сообщение могли удалить — перевыпустим ниже
        promptMessageId = undefined;
      }
    }
    const sent = await ctx.reply(text, { reply_markup: kb });
    promptMessageId = sent.message_id;
  };

  while (photoFileIds.length < MAX_PHOTOS) {
    const next = await conversation.wait();

    // /cancel
    if (next.message?.text?.trim() === "/cancel") {
      await next.reply("Добавление отменено.");
      return;
    }

    // Фото
    if (next.message?.photo) {
      const sizes = next.message.photo;
      const best = sizes[sizes.length - 1];
      photoFileIds.push(best.file_id);

      if (photoFileIds.length >= MAX_PHOTOS) {
        await showPrompt(
          `${MAX_PHOTOS}/${MAX_PHOTOS} — максимум. Переходим к названию.`,
          false,
        );
        break;
      }

      await showPrompt(
        `Фото ${photoFileIds.length}/${MAX_PHOTOS}. Добавить ещё или закончить?`,
        true,
      );
      continue;
    }

    // Кнопка «готово»
    if (next.callbackQuery?.data === "ap:pdone") {
      await next.answerCallbackQuery();
      break;
    }

    // Кнопка «ещё» — без нового сообщения, просто всплывашка
    if (next.callbackQuery?.data === "ap:pmore") {
      await next.answerCallbackQuery({ text: "Жду фото" });
      continue;
    }

    // Что-то другое
    await next.reply("Жду фото или нажми «готово».");
  }

  if (photoFileIds.length === 0) {
    await ctx.reply("Без фото товар не сохранить. Отменено.");
    return;
  }

  // ── Шаг 2: название ─────────────────────────────────────────────────────
  await ctx.reply("Название товара?");
  let name = "";
  while (true) {
    const next = await conversation.waitFor(":text");
    // waitFor(":text") гарантирует наличие message.text, но TS этого не выводит.
    const text = (next.message?.text ?? "").trim();
    if (text === "/cancel") {
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
    break;
  }

  // ── Шаг 3: цена ──────────────────────────────────────────────────────────
  await ctx.reply("Цена в рублях (целое число)?");
  let price = 0;
  while (true) {
    const next = await conversation.waitFor(":text");
    const text = (next.message?.text ?? "").trim();
    if (text === "/cancel") {
      await next.reply("Добавление отменено.");
      return;
    }
    // допускаем пробелы как разделители тысяч: «12 000» → 12000
    const parsed = Number(text.replace(/\s/g, ""));
    if (
      !Number.isInteger(parsed) ||
      parsed <= 0 ||
      parsed > MAX_PRICE
    ) {
      await next.reply(
        "Цена должна быть положительным целым числом (без копеек). Повтори.",
      );
      continue;
    }
    price = parsed;
    break;
  }

  // ── Шаг 4: features ─────────────────────────────────────────────────────
  await ctx.reply(
    "Теперь особенности товара (показываются только на странице товара, " +
      "не в общей сетке). Введи первую — одной строкой.\n" +
      "После каждой можно добавить ещё или нажать «готово».",
  );
  const features: string[] = [];
  // Тот же приём: одна перезаписываемая подсказка с кнопками.
  let featPromptId: number | undefined;
  const showFeatPrompt = async (text: string, withKb: boolean) => {
    const kb = withKb
      ? new InlineKeyboard()
          .text("➕ ещё особенность", "ap:fmore")
          .text("✅ готово", "ap:fdone")
      : undefined;
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

  while (features.length < MAX_FEATURES) {
    const next = await conversation.wait();

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
          false,
        );
        break;
      }

      await showFeatPrompt(
        `Особенностей: ${features.length}. Ещё или закончить?`,
        true,
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
    .text("❌ Отмена", "ap:cancel");

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

  // Публикация. Грузим фото и пишем БД через conversation.external,
  // чтобы при ре-плее побочки не дублировались.
  await decision
    .editMessageCaption({ caption: "Сохраняю..." })
    .catch(() => {});

  try {
    const productId = await conversation.external(async () => {
      const product = await prisma.product.create({
        data: { name, price, inStock: true },
      });

      // фото: грузим и пишем по одному, путь в bucket'е detached от имени
      // расширения (Supabase сохранит content-type, который определит upload.ts)
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
      .editMessageCaption({
        caption: `❌ Не получилось сохранить: ${msg}`,
      })
      .catch(() => {});
  }
}
