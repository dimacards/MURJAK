import { InlineKeyboard } from "grammy";
import { prisma } from "../../db";
import type { AppContext } from "../types";
import {
  restoreServiceButtons,
  setServiceEditLock,
} from "../service-chat";

const SERVICE_CHAT_ID = process.env.SERVICE_CHAT_ID;

/**
 * Меню выбора поля для редактирования. Шлётся работнику в ЛС после клика
 * по «✏️ Редактировать» в служебном чате.
 */
function buildEditFieldMenu(productId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text("📷 Фото", `editfield:${productId}:photos`)
    .text("🏷 Категория", `editfield:${productId}:category`)
    .row()
    .text("📏 Размер", `editfield:${productId}:size`)
    .text("⭐ Состояние", `editfield:${productId}:condition`)
    .row()
    .text("💰 Цена", `editfield:${productId}:price`)
    .text("↩️ Отмена", `editcancel:${productId}`);
}

/**
 * Handler для клика «✏️ Редактировать» в служебном чате.
 *
 * Поток:
 *  1. Проверка, что клик из служебного чата.
 *  2. Edit-lock на сообщении в служебном чате (текст «Редактирует: X», без кнопок).
 *  3. Попытка отправить меню полей в ЛС работнику.
 *  4. Если бот не смог написать в ЛС (403 — работник не делал /start):
 *     - снять edit-lock (вернуть кнопки)
 *     - написать в служебный чат «X, напиши боту /start в личке».
 *
 * MVP-ограничение (не реализовано): двое работников могут одновременно начать
 * редактировать. В будущем — поле Product.editingByWorkerId с таймаутом.
 */
export async function onEditClick(ctx: AppContext): Promise<void> {
  // Только из служебного чата
  if (String(ctx.chat?.id) !== SERVICE_CHAT_ID) {
    await ctx.answerCallbackQuery();
    return;
  }

  const productId = Number((ctx.match as RegExpMatchArray)?.[1]);
  if (!productId) {
    await ctx.answerCallbackQuery({ text: "Товар не найден.", show_alert: true });
    return;
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true },
  });
  if (!product) {
    await ctx.answerCallbackQuery({ text: "Товар не найден.", show_alert: true });
    return;
  }

  const worker = ctx.worker;
  const workerChatId = String(worker.telegramId);

  // 1. Поставить edit-lock — best effort, не валим флоу если editText упал
  // (например, текст уже совпадает — Telegram отказывает).
  try {
    await setServiceEditLock(ctx.api, product, worker.name);
  } catch (e) {
    console.warn("setServiceEditLock failed:", e instanceof Error ? e.message : e);
  }

  // 2. Отправить меню в ЛС работнику
  try {
    await ctx.api.sendMessage(
      workerChatId,
      `Редактирование товара №${product.id} (${product.category.name}, ${product.price} ₽).\nЧто меняем?`,
      { reply_markup: buildEditFieldMenu(productId) }
    );
  } catch (e) {
    // Скорее всего 403 — работник не делал /start
    console.warn(
      "Failed to DM worker for edit menu:",
      e instanceof Error ? e.message : e
    );
    // Откатить edit-lock
    try {
      await restoreServiceButtons(ctx.api, product);
    } catch (rollbackErr) {
      console.warn(
        "rollback restoreServiceButtons failed:",
        rollbackErr instanceof Error ? rollbackErr.message : rollbackErr
      );
    }
    // Подсказать в служебном чате
    if (ctx.chat) {
      await ctx.api
        .sendMessage(
          ctx.chat.id,
          `${worker.name}, напиши боту /start в личке и попробуй снова.`
        )
        .catch(() => {});
    }
    await ctx.answerCallbackQuery({
      text: "Не могу написать тебе в ЛС. Напиши боту /start.",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Открой ЛС с ботом" });
}

/**
 * Handler для клика «↩️ Отмена» в меню редактирования (в ЛС работника).
 * Возвращает кнопки в служебном чате и пишет «Отмена.» в ЛС.
 */
export async function onEditCancel(ctx: AppContext): Promise<void> {
  const productId = Number((ctx.match as RegExpMatchArray)?.[1]);
  if (!productId) {
    await ctx.answerCallbackQuery();
    return;
  }

  await ctx.answerCallbackQuery();
  await ctx.reply("Отмена. Возвращаюсь к товару.");

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true },
  });
  if (product) {
    try {
      await restoreServiceButtons(ctx.api, product);
    } catch (e) {
      console.error(
        "restoreServiceButtons in onEditCancel failed:",
        e instanceof Error ? e.message : e
      );
    }
  }
}
