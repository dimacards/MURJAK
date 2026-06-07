import { Bot } from "grammy";
import {
  conversations,
  createConversation,
  type ConversationData,
} from "@grammyjs/conversations";
import type { AppContext } from "./types";
import { privateOnly, whitelist } from "./middleware";
import { createPrismaConversationStorage } from "./storage";
import { startHandler } from "./handlers/start";
import { addProductConversation } from "./conversations/add-product";
import { prisma } from "../db";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN не задан в .env");

export const bot = new Bot<AppContext>(token);

// 0. Глобальный обработчик ошибок.
//
// КРИТИЧНО для serverless: без него любая необработанная ошибка в хендлере
// всплывает в webhookCallback → тот отдаёт HTTP 500 → Telegram считает
// доставку неудачной и РЕТРАИТ апдейт снова и снова. Здесь мы ошибку
// логируем, по возможности гасим спиннер кнопки, и НЕ пробрасываем дальше.
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(
    `[bot.catch] ошибка на update ${ctx.update.update_id}:`,
    err.error,
  );
  if (ctx.callbackQuery) {
    ctx
      .answerCallbackQuery({ text: "Что-то пошло не так, попробуй ещё раз." })
      .catch(() => {});
  }
});

// 1. Whitelist: отсекаем всех, кроме WORKER_TELEGRAM_ID из .env.
bot.use(whitelist);

// 1.5. Новая команда обрывает активный conversation.
//
// Без этого hook'а: если работник в середине /add_product отправит другую
// команду, текст «/foo» уходит в conversation как ввод вместо срабатывания
// команды. Перед conversations() middleware проверяем — если сообщение
// начинается с команды, удаляем активную сессию из BotSession для этого чата.
bot.use(async (ctx, next) => {
  const isCommand =
    ctx.message?.entities?.some(
      (e) => e.type === "bot_command" && e.offset === 0,
    ) ?? false;
  if (isCommand && ctx.chat?.id !== undefined) {
    await prisma.botSession
      .deleteMany({ where: { key: String(ctx.chat.id) } })
      .catch(() => {});
  }
  await next();
});

// 2. Conversations плагин с Prisma-storage (BotSession в БД).
// In-memory не работает на Vercel: каждый webhook-хит — потенциально
// свежий serverless процесс, in-memory Map не выживает между ними.
bot.use(
  conversations({
    storage: createPrismaConversationStorage<ConversationData>(),
  }),
);

// Регистрируем все conversation-функции по их именам.
bot.use(createConversation(addProductConversation, "addProductConversation"));

// 3. Команды (только в ЛС).
bot.command("start", privateOnly, startHandler);

bot.command("add_product", privateOnly, async (ctx) => {
  await ctx.conversation.enter("addProductConversation");
});

// /products будет зарегистрирована в этапе 5.
