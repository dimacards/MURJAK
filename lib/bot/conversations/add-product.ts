import { InlineKeyboard } from "grammy";
import type { Size } from "@prisma/client";
import { prisma } from "../../db";
import config from "../../config";
import type { AppContext, AppConversation } from "../types";
import { uploadTelegramPhotoToSupabase } from "../upload";
import {
  buildChannelCaptionFromParts,
  CAPTION_PARSE_MODE,
  publishToChannel,
} from "../channel";
import { sendToServiceChat } from "../service-chat";

const SIZES: Size[] = ["XS", "S", "M", "L", "XL", "XXL"];
const MAX_PHOTOS = 10;

type CollectedPhoto = { fileId: string };

/**
 * Пошаговый диалог добавления товара.
 *
 * Только в ЛС. Доступен и OWNER, и WORKER (проверка whitelist в bot middleware).
 *
 * Шаги:
 *  1. фото (1..10)
 *  2. категория (inline)
 *  3. размер (inline, XS..XXL)
 *  4. состояние (текст, 1..10)
 *  5. цена (текст, рубли)
 *  6. превью с альбомом + «Опубликовать»/«Отмена»
 *  7. на «Опубликовать»: загрузить фото в Supabase + создать Product+Photo в БД
 */
export async function addProductConversation(
  conversation: AppConversation,
  ctx: AppContext,
  workerId: number
): Promise<void> {
  // ⚠️ Нельзя использовать ctx.worker внутри conversation-функции —
  // outer middleware (whitelist) не запускается на replay внутри conversation,
  // поэтому ctx.worker там undefined. ID работника прокидываем явно через enter().
  // ── Шаг 1: фото ───────────────────────────────────────────────────────────
  const photos: CollectedPhoto[] = [];

  // Одно сообщение-индикатор: при первом фото создаём, на остальные —
  // редактируем через editMessageText. Это избавляет от спама ответов
  // когда пользователь шлёт альбом из нескольких фото за раз.
  let promptMessageId: number | undefined = undefined;

  await ctx.reply(
    `Загрузи фото товара. От 1 до ${MAX_PHOTOS}. ` +
      `После каждого фото счётчик будет обновляться. ` +
      `Чтобы прервать — нажми «Отмена» или напиши /cancel.`,
    {
      reply_markup: new InlineKeyboard().text("Отмена", "ap_cancel"),
    }
  );

  collectingPhotos: while (true) {
    if (photos.length >= MAX_PHOTOS) break;

    const next = await conversation.wait();

    // Текстовая отмена
    if (next.message?.text === "/cancel") {
      await next.reply("Отменено.");
      return;
    }

    // Кнопка
    if (next.callbackQuery) {
      const data = next.callbackQuery.data ?? "";
      if (data === "ap_cancel") {
        await next.answerCallbackQuery();
        await next.reply("Отменено.");
        return;
      }
      if (data === "ap_done") {
        if (photos.length === 0) {
          await next.answerCallbackQuery({
            text: "Нужно хотя бы одно фото.",
            show_alert: true,
          });
          continue collectingPhotos;
        }
        await next.answerCallbackQuery();
        break collectingPhotos;
      }
      // незнакомый callback — игнорим
      await next.answerCallbackQuery();
      continue collectingPhotos;
    }

    // Фото
    if (next.message?.photo) {
      // photo[] идёт от мелкой версии к крупной — берём самую крупную
      const sizes = next.message.photo;
      const best = sizes[sizes.length - 1];
      photos.push({ fileId: best.file_id });

      const limitReached = photos.length >= MAX_PHOTOS;
      const text = limitReached
        ? `Лимит ${MAX_PHOTOS} фото достигнут. Двигаемся дальше.`
        : `Фото ${photos.length}. Можно ещё или жми «Готово».`;
      const kb = limitReached
        ? undefined
        : new InlineKeyboard()
            .text(`Готово (${photos.length}/${MAX_PHOTOS})`, "ap_done")
            .text("Отмена", "ap_cancel");

      const chatId = next.chat?.id;
      if (promptMessageId !== undefined && chatId !== undefined) {
        // Обновляем существующее сообщение. Игнорим возможные rate-limit
        // или «message is not modified» — это не критично.
        await next.api
          .editMessageText(chatId, promptMessageId, text, {
            reply_markup: kb,
          })
          .catch(() => {});
      } else {
        // Первое фото — создаём prompt-сообщение, запоминаем id.
        const sent = await next.reply(text, { reply_markup: kb });
        promptMessageId = sent.message_id;
      }

      if (limitReached) break collectingPhotos;
      continue collectingPhotos;
    }

    // что-то другое — пропускаем без ответа
  }

  // ── Шаг 2: категория ──────────────────────────────────────────────────────
  // Кнопка «➕ Новая категория» позволяет создать категорию прямо здесь, не
  // выходя из диалога. После создания она автоматически выбирается для товара.
  let categories = await conversation.external(() =>
    prisma.category.findMany({ orderBy: { name: "asc" } })
  );

  async function showCategoryMenu(): Promise<void> {
    const catKb = new InlineKeyboard();
    for (const c of categories) catKb.text(c.name, `ap_cat:${c.id}`).row();
    catKb.text("➕ Новая категория", "ap_cat:new").row();
    catKb.text("Отмена", "ap_cancel");

    if (categories.length === 0) {
      await ctx.reply(
        "Категорий пока нет. Создай первую — жми «➕ Новая категория».",
        { reply_markup: catKb }
      );
    } else {
      await ctx.reply("Выбери категорию:", { reply_markup: catKb });
    }
  }

  await showCategoryMenu();

  let categoryId: number;
  categoryLoop: while (true) {
    const next = await conversation.waitForCallbackQuery(
      /^ap_(cat:(?:\d+|new)|cancel)$/
    );
    const data = next.callbackQuery.data;

    if (data === "ap_cancel") {
      await next.answerCallbackQuery();
      await ctx.reply("Отменено.");
      return;
    }

    if (data === "ap_cat:new") {
      await next.answerCallbackQuery();
      // Подшаг: ввести название новой категории.
      await ctx.reply("Введи название новой категории (или /cancel):");
      while (true) {
        const nameMsg = await conversation.waitFor("message:text");
        const name = nameMsg.message.text.trim();
        if (name === "/cancel") {
          await nameMsg.reply("Отменено.");
          return;
        }
        if (!name) {
          await nameMsg.reply("Пустое название. Введи ещё раз (или /cancel):");
          continue;
        }
        const existing = await conversation.external(() =>
          prisma.category.findUnique({ where: { name } })
        );
        if (existing) {
          await nameMsg.reply(
            `Категория «${name}» уже есть. Возвращаю меню — выбери её или придумай другое имя.`
          );
          categories = await conversation.external(() =>
            prisma.category.findMany({ orderBy: { name: "asc" } })
          );
          await showCategoryMenu();
          continue categoryLoop;
        }
        const created = await conversation.external(() =>
          prisma.category.create({ data: { name } })
        );
        categories = await conversation.external(() =>
          prisma.category.findMany({ orderBy: { name: "asc" } })
        );
        categoryId = created.id;
        await nameMsg.reply(
          `Категория «${created.name}» создана и выбрана для товара.`
        );
        break categoryLoop;
      }
    }

    const m = data?.match(/^ap_cat:(\d+)$/);
    if (m) {
      categoryId = Number(m[1]);
      await next.answerCallbackQuery();
      break;
    }
  }

  // ── Шаг 2.5: описание (короткое название товара) ─────────────────────────
  await ctx.reply(
    "Введи короткое название товара (например: «Cardigan Jenasis»).\n" +
      "Это будет жирным заголовком поста в канале.\n" +
      "Пропустить и оставить только категорию — отправь точку «.»"
  );
  let description: string | null = null;
  while (true) {
    const next = await conversation.waitFor("message:text");
    const text = next.message.text.trim();
    if (text === "/cancel") {
      await next.reply("Отменено.");
      return;
    }
    if (text === ".") {
      description = null;
      break;
    }
    if (text.length > 200) {
      await next.reply("Слишком длинно (макс. 200 символов). Сократи или /cancel:");
      continue;
    }
    description = text;
    break;
  }

  // ── Шаг 3: размер ─────────────────────────────────────────────────────────
  const sizeKb = new InlineKeyboard()
    .text("XS", "ap_size:XS")
    .text("S", "ap_size:S")
    .text("M", "ap_size:M")
    .row()
    .text("L", "ap_size:L")
    .text("XL", "ap_size:XL")
    .text("XXL", "ap_size:XXL")
    .row()
    .text("Отмена", "ap_cancel");
  await ctx.reply("Выбери размер:", { reply_markup: sizeKb });

  let size: Size;
  while (true) {
    const next = await conversation.waitForCallbackQuery(
      /^ap_(size:(?:XS|S|M|L|XL|XXL)|cancel)$/
    );
    const data = next.callbackQuery.data;
    if (data === "ap_cancel") {
      await next.answerCallbackQuery();
      await ctx.reply("Отменено.");
      return;
    }
    const m = data?.match(/^ap_size:(\w+)$/);
    if (m && SIZES.includes(m[1] as Size)) {
      size = m[1] as Size;
      await next.answerCallbackQuery();
      break;
    }
  }

  // ── Шаг 4: состояние ──────────────────────────────────────────────────────
  await ctx.reply("Укажи состояние (целое число от 1 до 10):");
  let condition: number;
  while (true) {
    const next = await conversation.waitFor("message:text");
    const text = next.message.text.trim();
    if (text === "/cancel") {
      await next.reply("Отменено.");
      return;
    }
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1 || n > 10) {
      await next.reply(
        "Это не целое число от 1 до 10. Попробуй ещё раз (или /cancel):"
      );
      continue;
    }
    condition = n;
    break;
  }

  // ── Шаг 5: цена ───────────────────────────────────────────────────────────
  await ctx.reply("Укажи цену в рублях (целое число):");
  let price: number;
  while (true) {
    const next = await conversation.waitFor("message:text");
    const text = next.message.text.trim();
    if (text === "/cancel") {
      await next.reply("Отменено.");
      return;
    }
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1) {
      await next.reply(
        "Это не положительное целое число. Попробуй ещё раз (или /cancel):"
      );
      continue;
    }
    price = n;
    break;
  }

  // ── Шаг 6: превью + подтверждение ─────────────────────────────────────────
  const category = categories.find((c) => c.id === categoryId);
  if (!category) {
    await ctx.reply("Категория была удалена пока ты заполнял форму. Отмена.");
    return;
  }

  // Превью использует ту же подпись, что будет в канале — единый формат.
  const previewTitle = description?.trim() || category.name;
  const caption = buildChannelCaptionFromParts({
    title: previewTitle,
    categoryName: category.name,
    size,
    condition,
    price,
  });

  // Альбом фото с подписью на первом
  await ctx.replyWithMediaGroup(
    photos.map((p, idx) => ({
      type: "photo",
      media: p.fileId,
      caption: idx === 0 ? caption : undefined,
      parse_mode: idx === 0 ? CAPTION_PARSE_MODE : undefined,
    }))
  );

  // Отдельное сообщение с кнопками (на медиа-альбоме нельзя)
  await ctx.reply("Опубликовать?", {
    reply_markup: new InlineKeyboard()
      .text("✅ Опубликовать", "ap_publish")
      .text("❌ Отмена", "ap_cancel"),
  });

  while (true) {
    const next = await conversation.waitForCallbackQuery(
      /^ap_(publish|cancel)$/
    );
    const data = next.callbackQuery.data;
    if (data === "ap_cancel") {
      await next.answerCallbackQuery();
      // Убираем кнопки, чтобы повторный клик был невозможен.
      await next.editMessageReplyMarkup().catch(() => {});
      await ctx.reply("Отменено.");
      return;
    }
    if (data === "ap_publish") {
      await next.answerCallbackQuery({ text: "Сохраняю..." });
      // Защита от дабл-тапа: сразу убираем inline-кнопки у превью.
      // Повторный клик уже не на чем сделать → дубля публикации не будет.
      await next.editMessageReplyMarkup().catch(() => {});
      break;
    }
  }

  // ── Шаг 7: загрузка в Supabase + сохранение в БД ──────────────────────────
  const progress = await ctx.reply(
    `Загружаю фото в хранилище (0/${photos.length})...`
  );

  const timestamp = Date.now();
  const uploaded: Array<{
    telegramFileId: string;
    storagePath: string;
    publicUrl: string;
  }> = [];

  try {
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      const result = await conversation.external(() =>
        uploadTelegramPhotoToSupabase(
          ctx.api,
          p.fileId,
          `products/${timestamp}_${i}.jpg`
        )
      );
      uploaded.push({ telegramFileId: p.fileId, ...result });

      // Прогресс на каждое успешное фото. Никогда не должно ронять основной флоу:
      // обращаемся к ctx.chat через optional chaining и оборачиваем в catch.
      const chatId = ctx.chat?.id;
      if (chatId !== undefined) {
        await ctx.api
          .editMessageText(
            chatId,
            progress.message_id,
            `Загружаю фото в хранилище (${i + 1}/${photos.length})...`
          )
          .catch(() => {});
      }
    }
  } catch (e) {
    console.error("Upload failed:", e);
    await ctx.reply(
      `Ошибка загрузки фото: ${e instanceof Error ? e.message : String(e)}\nПопробуй ещё раз через /add_product.`
    );
    return;
  }

  // Сохраняем Product + Photo в одной транзакции
  const product = await conversation.external(() =>
    prisma.product.create({
      data: {
        categoryId,
        description,
        size,
        condition,
        price,
        status: "ACTIVE",
        channelMessageIds: [],
        serviceMessageId: null,
        serviceMediaMessageIds: [],
        createdById: workerId,
        photos: {
          create: uploaded.map((u, idx) => ({
            storagePath: u.storagePath,
            publicUrl: u.publicUrl,
            telegramFileId: u.telegramFileId,
            order: idx,
          })),
        },
      },
      include: { category: true, photos: true },
    })
  );

  // ── Шаг 8: публикация в канал ─────────────────────────────────────────────
  let channelMessageIds: number[];
  try {
    channelMessageIds = await publishToChannel(
      ctx.api,
      product,
      product.photos
    );
  } catch (e) {
    console.error("publishToChannel failed:", e);
    await ctx.reply(
      `Товар сохранён в БД (id=${product.id}), но не удалось опубликовать в канал:\n` +
        `${e instanceof Error ? e.message : String(e)}\n\n` +
        `Проверь, что бот добавлен в канал как админ с правом постинга.`
    );
    return;
  }

  // Сохраняем message_id-ы канала в БД — пригодятся для последующих
  // editCaption / delete / SOLD-операций (Этапы 7–8).
  await conversation.external(() =>
    prisma.product.update({
      where: { id: product.id },
      data: { channelMessageIds },
    })
  );

  // ── Шаг 9: копия в служебный чат (ОПЦИОНАЛЬНО) ────────────────────────────
  // Если SERVICE_CHAT_ID не задан в .env — пропускаем. Управление товаром
  // тогда идёт через команду /products в боте.
  const serviceChatEnabled = Boolean(process.env.SERVICE_CHAT_ID);
  if (serviceChatEnabled) {
    try {
      const serviceIds = await sendToServiceChat(
        ctx.api,
        product,
        product.photos
      );
      await conversation.external(() =>
        prisma.product.update({
          where: { id: product.id },
          data: {
            serviceMediaMessageIds: serviceIds.mediaMessageIds,
            serviceMessageId: serviceIds.controlMessageId,
          },
        })
      );
    } catch (e) {
      console.error("sendToServiceChat failed:", e);
      await ctx.reply(
        `Товар опубликован в канале, но не удалось отправить копию в служебный чат:\n` +
          `${e instanceof Error ? e.message : String(e)}\n\n` +
          `Управлять товаром можно через /products.`
      );
      return;
    }
  }

  const channelMention = config.channelUsername
    ? `@${config.channelUsername}`
    : "канале";
  const manageHint = serviceChatEnabled
    ? "Управляй кнопками в служебном чате или через /products."
    : "Управлять товаром можно через /products.";
  await ctx.reply(
    `✅ Товар опубликован в ${channelMention}. ${manageHint}`
  );
}
