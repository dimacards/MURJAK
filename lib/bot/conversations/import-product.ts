import { InlineKeyboard } from "grammy";
import { prisma } from "../../db";
import config from "../../config";
import type { AppContext, AppConversation } from "../types";
import { uploadTelegramPhotoToSupabase } from "../upload";
import { parseCaption, type ParsedCaption } from "../parse-caption";

const CLOTHING_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
const MAX_PHOTOS = 10;

/** Аргументы при входе в импорт-conversation. Прокидываются из bot.on. */
export type ImportEntryArgs = {
  workerId: number;
  /** file_id первой фотки из пересланного. */
  firstFileId: string;
  /** Подпись поста (с тегами HTML — парсер чистит сам). */
  caption?: string;
  /** message_id оригинального поста в канале (для альбома — id первой). */
  originalMessageId: number;
  /** media_group_id если это альбом; null/undefined — одиночное фото. */
  mediaGroupId?: string;
};

type CollectedPhoto = { fileId: string; originalMessageId: number };

/**
 * Импорт уже опубликованного поста из канала.
 *
 * Юзер пересылает альбом из канала боту в личку. Первое фото триггерит
 * вход в эту conversation (через bot.on("message:photo")). Дальше:
 *
 *  1. Собираем остальные фото альбома (Telegram присылает их как отдельные
 *     сообщения с одинаковым media_group_id). Юзер жмёт «Готово» когда
 *     все долетели — или сразу, если фото одно.
 *
 *  2. Парсим подпись по нашему формату (Размер/Состояние/Цена). Что не
 *     распарсилось — undefined, юзер заполнит вручную.
 *
 *  3. Спрашиваем категорию (её из подписи не вытащить).
 *
 *  4. Показываем превью распарсенного — кнопки «Сохранить» / «Изменить
 *     поле» / «Отмена».
 *
 *  5. На «Сохранить»: качаем фото в Supabase, создаём Product со
 *     status=ACTIVE, channelMessageIds = массив оригинальных message_id
 *     (бот сможет потом удалить пост при пометке SOLD).
 *
 *  Ограничение: импортированные посты бот не сможет редактировать
 *  (editMessage* работает только на собственных сообщениях бота). Менять
 *  description/цену/etc. — только в БД и на сайте; пост в канале остаётся
 *  как есть. На SOLD: удаляем пост в канале.
 */
export async function importProductConversation(
  conversation: AppConversation,
  ctx: AppContext,
  args: ImportEntryArgs
): Promise<void> {
  // ── Шаг 1: собираем фото альбома ──────────────────────────────────────────
  const photos: CollectedPhoto[] = [
    { fileId: args.firstFileId, originalMessageId: args.originalMessageId },
  ];

  const isAlbum = Boolean(args.mediaGroupId);

  function statusText(): string {
    if (!isAlbum) {
      return (
        `Импорт из канала. Получено фото: 1.\n\n` +
        `Если это альбом — пришли остальные фото (тоже пересылкой). ` +
        `Когда все долетят, жми «✅ Готово».`
      );
    }
    return (
      `Импорт из канала. Получено фото: ${photos.length}/${MAX_PHOTOS}.\n\n` +
      `Жди остальные или жми «✅ Готово», если все на месте.`
    );
  }

  const statusKb = new InlineKeyboard()
    .text("✅ Готово", "ip_ready")
    .text("❌ Отмена", "ip_cancel");

  const statusMsg = await ctx.reply(statusText(), { reply_markup: statusKb });
  const statusChatId = ctx.chat?.id;
  const statusMessageId = statusMsg.message_id;

  collectingPhotos: while (photos.length < MAX_PHOTOS) {
    const next = await conversation.wait();

    // отмена/готово
    if (next.callbackQuery) {
      const data = next.callbackQuery.data ?? "";
      if (data === "ip_cancel") {
        await next.answerCallbackQuery();
        await next.editMessageReplyMarkup().catch(() => {});
        await ctx.reply("Импорт отменён.");
        return;
      }
      if (data === "ip_ready") {
        await next.answerCallbackQuery();
        break collectingPhotos;
      }
      // прочие callback'и игнорим
      await next.answerCallbackQuery();
      continue;
    }

    // /cancel текстом
    if (next.message?.text === "/cancel") {
      await next.reply("Импорт отменён.");
      return;
    }

    // ещё одно фото
    if (next.message?.photo) {
      // Принимаем только переслы из канала (того же media_group_id если альбом).
      const fwd = next.message.forward_origin;
      const sameGroup =
        args.mediaGroupId &&
        next.message.media_group_id === args.mediaGroupId;
      if (!fwd && !sameGroup) {
        // обычное фото вне импорта — игнорим
        continue;
      }
      const sizes = next.message.photo;
      const best = sizes[sizes.length - 1];
      const origMsgId =
        fwd && "message_id" in fwd && typeof fwd.message_id === "number"
          ? fwd.message_id
          : next.message.message_id;
      photos.push({ fileId: best.file_id, originalMessageId: origMsgId });

      // Обновляем статус-сообщение
      if (statusChatId !== undefined) {
        await next.api
          .editMessageText(statusChatId, statusMessageId, statusText(), {
            reply_markup: statusKb,
          })
          .catch(() => {});
      }
      continue;
    }

    // всё остальное — игнор
  }

  // ── Шаг 2: парсим подпись ─────────────────────────────────────────────────
  const parsed: ParsedCaption = parseCaption(args.caption);

  // ── Шаг 3: категория (всегда спрашиваем) ─────────────────────────────────
  let categories = await conversation.external(() =>
    prisma.category.findMany({ orderBy: { name: "asc" } })
  );

  async function showCategoryMenu(): Promise<void> {
    const catKb = new InlineKeyboard();
    for (const c of categories) catKb.text(c.name, `ip_cat:${c.id}`).row();
    catKb.text("➕ Новая категория", "ip_cat:new").row();
    catKb.text("Отмена", "ip_cancel");
    if (categories.length === 0) {
      await ctx.reply(
        "Категорий пока нет. Создай первую — жми «➕ Новая категория».",
        { reply_markup: catKb }
      );
    } else {
      await ctx.reply("Выбери категорию товара:", { reply_markup: catKb });
    }
  }

  await showCategoryMenu();

  let categoryId: number;
  categoryLoop: while (true) {
    const next = await conversation.waitForCallbackQuery(
      /^ip_(cat:(?:\d+|new)|cancel)$/
    );
    const data = next.callbackQuery.data;
    if (data === "ip_cancel") {
      await next.answerCallbackQuery();
      await ctx.reply("Импорт отменён.");
      return;
    }
    if (data === "ip_cat:new") {
      await next.answerCallbackQuery();
      await ctx.reply("Введи название новой категории (или /cancel):");
      while (true) {
        const nameMsg = await conversation.waitFor("message:text");
        const name = nameMsg.message.text.trim();
        if (name === "/cancel") {
          await nameMsg.reply("Импорт отменён.");
          return;
        }
        if (!name) {
          await nameMsg.reply(
            "Пустое название. Введи ещё раз (или /cancel):"
          );
          continue;
        }
        const existing = await conversation.external(() =>
          prisma.category.findUnique({ where: { name } })
        );
        if (existing) {
          await nameMsg.reply(
            `Категория «${name}» уже есть. Выбери её из меню.`
          );
          categories = await conversation.external(() =>
            prisma.category.findMany({ orderBy: { name: "asc" } })
          );
          await showCategoryMenu();
          continue categoryLoop;
        }
        await nameMsg.reply(`Какие размеры у «${name}»?`, {
          reply_markup: new InlineKeyboard()
            .text("👕 Одежда", "ip_cattype:CLOTHING")
            .text("👟 Обувь", "ip_cattype:SHOE"),
        });
        const typePick = await conversation.waitForCallbackQuery(
          /^ip_cattype:(CLOTHING|SHOE)$/
        );
        const sizeType = (typePick.match as RegExpMatchArray)[1] as
          | "CLOTHING"
          | "SHOE";
        await typePick.answerCallbackQuery();
        await typePick.editMessageReplyMarkup().catch(() => {});
        const created = await conversation.external(() =>
          prisma.category.create({ data: { name, sizeType } })
        );
        categories = await conversation.external(() =>
          prisma.category.findMany({ orderBy: { name: "asc" } })
        );
        categoryId = created.id;
        await ctx.reply(`Категория «${created.name}» создана.`);
        break categoryLoop;
      }
    }
    const m = data?.match(/^ip_cat:(\d+)$/);
    if (m) {
      categoryId = Number(m[1]);
      await next.answerCallbackQuery();
      break;
    }
  }

  const category = categories.find((c) => c.id === categoryId);
  if (!category) {
    await ctx.reply("Категория недоступна. Импорт отменён.");
    return;
  }

  // ── Шаг 4: превью + редактирование полей ──────────────────────────────────
  // Состояние draft заполняем из parsed + пустоты допишет юзер через меню.
  const draft = {
    description: parsed.description ?? null,
    size: parsed.size ?? null,
    condition: parsed.condition ?? null,
    price: parsed.price ?? null,
  };

  function describeDraft(): string {
    const dash = "—";
    return (
      `📦 Импорт товара\n\n` +
      `📌 Название: ${draft.description ?? dash}\n` +
      `🏷 Категория: ${category!.name}\n` +
      `📏 Размер: ${draft.size ?? dash}\n` +
      `⭐ Состояние: ${draft.condition !== null ? `${draft.condition}/10` : dash}\n` +
      `💰 Цена: ${draft.price !== null ? `${draft.price} ${config.currency}` : dash}\n` +
      `🖼 Фото: ${photos.length} шт.`
    );
  }

  function previewKeyboard(): InlineKeyboard {
    return new InlineKeyboard()
      .text("✏️ Изменить поле", "ip_edit")
      .row()
      .text("✅ Сохранить", "ip_save")
      .text("❌ Отмена", "ip_cancel");
  }

  async function showPreview(): Promise<void> {
    await ctx.reply(describeDraft(), { reply_markup: previewKeyboard() });
  }

  await showPreview();

  previewLoop: while (true) {
    const next = await conversation.waitForCallbackQuery(
      /^ip_(edit|save|cancel)$/
    );
    const data = next.callbackQuery.data;
    if (data === "ip_cancel") {
      await next.answerCallbackQuery();
      await next.editMessageReplyMarkup().catch(() => {});
      await ctx.reply("Импорт отменён.");
      return;
    }
    if (data === "ip_edit") {
      await next.answerCallbackQuery();
      // Меню полей для редактирования.
      await ctx.reply("Какое поле изменить?", {
        reply_markup: new InlineKeyboard()
          .text("📌 Название", "ip_field:description")
          .row()
          .text("📏 Размер", "ip_field:size")
          .row()
          .text("⭐ Состояние", "ip_field:condition")
          .row()
          .text("💰 Цена", "ip_field:price")
          .row()
          .text("↩️ Назад", "ip_field:back"),
      });
      const fpick = await conversation.waitForCallbackQuery(
        /^ip_field:(description|size|condition|price|back)$/
      );
      const field = (fpick.match as RegExpMatchArray)[1] as
        | "description"
        | "size"
        | "condition"
        | "price"
        | "back";
      await fpick.answerCallbackQuery();
      if (field === "back") {
        await showPreview();
        continue previewLoop;
      }

      if (field === "description") {
        await ctx.reply(
          "Введи название товара (до 200 символов). Или «.» чтобы пропустить и оставить только категорию."
        );
        const m = await conversation.waitFor("message:text");
        const t = m.message.text.trim();
        if (t === "/cancel") {
          await m.reply("Импорт отменён.");
          return;
        }
        draft.description = t === "." ? null : t.slice(0, 200);
      }

      if (field === "size") {
        if (category.sizeType === "SHOE") {
          await ctx.reply("Укажи размер обуви (например, 42):");
          const m = await conversation.waitFor("message:text");
          const t = m.message.text.trim();
          if (t === "/cancel") {
            await m.reply("Импорт отменён.");
            return;
          }
          draft.size = t.slice(0, 10);
        } else {
          const sizeKb = new InlineKeyboard()
            .text("XS", "ip_size:XS")
            .text("S", "ip_size:S")
            .text("M", "ip_size:M")
            .row()
            .text("L", "ip_size:L")
            .text("XL", "ip_size:XL")
            .text("XXL", "ip_size:XXL");
          await ctx.reply("Выбери размер:", { reply_markup: sizeKb });
          const sp = await conversation.waitForCallbackQuery(
            /^ip_size:(XS|S|M|L|XL|XXL)$/
          );
          await sp.answerCallbackQuery();
          draft.size = (sp.match as RegExpMatchArray)[1];
          if (!(CLOTHING_SIZES as readonly string[]).includes(draft.size!)) {
            draft.size = null;
          }
        }
      }

      if (field === "condition") {
        await ctx.reply("Состояние от 1 до 10:");
        while (true) {
          const m = await conversation.waitFor("message:text");
          const t = m.message.text.trim();
          if (t === "/cancel") {
            await m.reply("Импорт отменён.");
            return;
          }
          const n = Number(t);
          if (!Number.isInteger(n) || n < 1 || n > 10) {
            await m.reply("Целое от 1 до 10. Ещё раз:");
            continue;
          }
          draft.condition = n;
          break;
        }
      }

      if (field === "price") {
        await ctx.reply("Цена в рублях, целое число:");
        while (true) {
          const m = await conversation.waitFor("message:text");
          const t = m.message.text.trim();
          if (t === "/cancel") {
            await m.reply("Импорт отменён.");
            return;
          }
          const n = Number(t);
          if (!Number.isInteger(n) || n < 1) {
            await m.reply("Положительное целое. Ещё раз:");
            continue;
          }
          draft.price = n;
          break;
        }
      }

      await showPreview();
      continue previewLoop;
    }

    if (data === "ip_save") {
      // Проверяем что обязательные поля заполнены. Description опционален —
      // если null, в посте/на сайте отображается название категории.
      const missing: string[] = [];
      if (draft.size === null) missing.push("размер");
      if (draft.condition === null) missing.push("состояние");
      if (draft.price === null) missing.push("цена");
      if (missing.length > 0) {
        await next.answerCallbackQuery({
          text: `Не хватает: ${missing.join(", ")}. Нажми «Изменить поле».`,
          show_alert: true,
        });
        continue;
      }
      await next.answerCallbackQuery({ text: "Сохраняю..." });
      await next.editMessageReplyMarkup().catch(() => {});
      break previewLoop;
    }
  }

  // ── Шаг 5: проверка на дубль + загрузка фото в Supabase + Product ────────
  // Защита от дублей: если другой пользователь / параллельная пересылка
  // (та же media_group) уже импортировали этот пост — не создаём дубль и
  // НЕ грузим фото в Supabase зря.
  const channelMessageIds = photos
    .map((p) => p.originalMessageId)
    .sort((a, b) => a - b);
  const alreadyImported = await conversation.external(() =>
    prisma.product.findFirst({
      where: { channelMessageIds: { hasSome: channelMessageIds } },
      select: { id: true },
    })
  );
  if (alreadyImported) {
    await ctx.reply(
      `Этот пост уже импортирован — товар №${alreadyImported.id}. ` +
        `Открыть его можно через /products. Импорт отменён.`
    );
    return;
  }

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
    console.error("Import upload failed:", e);
    await ctx.reply(
      `Ошибка загрузки фото: ${e instanceof Error ? e.message : String(e)}`
    );
    return;
  }

  // Повторная проверка на дубль непосредственно перед INSERT — окно гонки
  // (две параллельные пересылки) могло не закрыться первой проверкой.
  const alreadyImported2 = await conversation.external(() =>
    prisma.product.findFirst({
      where: { channelMessageIds: { hasSome: channelMessageIds } },
      select: { id: true },
    })
  );
  if (alreadyImported2) {
    await ctx.reply(
      `Гонка: пост успели импортировать (товар №${alreadyImported2.id}). ` +
        `Создавать дубль не стал. Загруженные сейчас фото удалю.`
    );
    // best-effort удаление: не критично если упадёт.
    try {
      const { supabase, SUPABASE_BUCKET } = await import("../../supabase");
      await supabase.storage
        .from(SUPABASE_BUCKET)
        .remove(uploaded.map((u) => u.storagePath));
    } catch {}
    return;
  }

  const product = await conversation.external(() =>
    prisma.product.create({
      data: {
        categoryId,
        description: draft.description,
        size: draft.size!,
        condition: draft.condition!,
        price: draft.price!,
        status: "ACTIVE",
        visibleOnSite: true,
        isImported: true, // оригинал в канале — чужое сообщение для бота
        channelMessageIds,
        serviceMessageId: null,
        serviceMediaMessageIds: [],
        createdById: args.workerId,
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

  await ctx.reply(
    `✅ Импортирован товар №${product.id}.\n` +
      `Используется оригинальный пост в канале.\n` +
      `При редактировании / пометке ПРОДАНО оригинал будет ПЕРЕСОЗДАН\n` +
      `(Telegram не разрешает ботам редактировать чужие сообщения), ` +
      `после чего следующие правки уже идут на месте.\n\n` +
      `Управлять — через /products.`
  );
}
