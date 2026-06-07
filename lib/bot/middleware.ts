import type { NextFunction } from "grammy";
import type { AppContext } from "./types";

/**
 * Telegram ID единственного работника-владельца. Берётся из .env при старте.
 * Если переменная не задана — бросаем при загрузке модуля: лучше упасть
 * на старте, чем впустить любого в управление магазином.
 */
function getWorkerTelegramId(): bigint {
  const raw = process.env.WORKER_TELEGRAM_ID;
  if (!raw) throw new Error("WORKER_TELEGRAM_ID не задан в .env");
  const id = BigInt(raw);
  if (id <= BigInt(0)) {
    throw new Error(`WORKER_TELEGRAM_ID невалидный: «${raw}»`);
  }
  return id;
}

const WORKER_TELEGRAM_ID = getWorkerTelegramId();

/**
 * Whitelist: пропускаем дальше только работника (его telegram_id из .env).
 * Чужие сообщения в ЛС — отвечаем «нет доступа». В групповых чатах и
 * canal-постах — молча игнор.
 *
 * Callback-кнопки от чужих тоже отсекаем (хотя в норме они никому, кроме
 * работника, не отправляются — оставляем как защиту от подделки).
 */
export async function whitelist(
  ctx: AppContext,
  next: NextFunction,
): Promise<void> {
  const from = ctx.from;
  if (!from) return; // channel posts и т.п.

  if (BigInt(from.id) !== WORKER_TELEGRAM_ID) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: "Нет доступа", show_alert: false });
    } else if (ctx.chat?.type === "private") {
      await ctx.reply(
        "Извини, я тебя не знаю. Этот бот — для управления товарами магазина.",
      );
    }
    return;
  }

  await next();
}

/**
 * privateOnly: пропускает только сообщения из приватных чатов.
 * Команды работают только в ЛС (бот не предназначен для групп).
 */
export async function privateOnly(
  ctx: AppContext,
  next: NextFunction,
): Promise<void> {
  if (ctx.chat?.type !== "private") return;
  await next();
}
