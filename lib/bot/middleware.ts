import type { NextFunction } from "grammy";
import { prisma } from "../db";
import type { AppContext } from "./types";

/**
 * Whitelist: на каждое обновление проверяем, есть ли отправитель в таблице Worker.
 *
 * - Если работника НЕТ:
 *     * в личке — отвечаем, что доступа нет.
 *     * при нажатии кнопки (callback_query) — отвечаем «Нет доступа» без alert.
 *     * в группе для обычных сообщений — молча игнорируем.
 *   Управление дальше НЕ передаём.
 *
 * - Если работник найден — кладём его в ctx.worker и передаём управление.
 */
export async function whitelist(
  ctx: AppContext,
  next: NextFunction
): Promise<void> {
  const from = ctx.from;
  if (!from) {
    // Channel posts, etc. — у них нет from. Игнорируем.
    return;
  }

  const worker = await prisma.worker.findUnique({
    where: { telegramId: BigInt(from.id) },
  });

  if (!worker) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({
        text: "Нет доступа",
        show_alert: false,
      });
    } else if (ctx.chat?.type === "private") {
      await ctx.reply(
        "Извини, я тебя не знаю. Доступ к боту только у работников магазина."
      );
    }
    // В групповом чате обычные сообщения от посторонних — молча игнорируем.
    return;
  }

  ctx.worker = worker;
  await next();
}

/**
 * privateOnly: пропускает только сообщения из приватных чатов.
 * Используется для команд (/start, /add_product и т.д.) — они работают только в ЛС.
 */
export async function privateOnly(
  ctx: AppContext,
  next: NextFunction
): Promise<void> {
  if (ctx.chat?.type !== "private") return;
  await next();
}
