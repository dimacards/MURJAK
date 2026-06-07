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
import {
  productsCommand,
  onProductsList,
  onProductOpen,
  onProductToggleStock,
  onProductDelPrompt,
  onProductDelConfirm,
  onProductEditFeatures,
  onFeatureDelete,
} from "./handlers/products";
import { addProductConversation } from "./conversations/add-product";
import {
  editNameConversation,
  editPriceConversation,
  editPhotosConversation,
  addFeatureConversation,
} from "./conversations/edit-product";
import { prisma } from "../db";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN не задан в .env");

export const bot = new Bot<AppContext>(token);

// 0. Глобальный обработчик ошибок.
//
// КРИТИЧНО для serverless: без него любая необработанная ошибка в хендлере
// всплывает в webhookCallback → тот отдаёт HTTP 500 → Telegram считает
// доставку неудачной и РЕТРАИТ апдейт снова и снова.
//
// Дополнительно: чистим BotSession для чата. Иначе сломанный conversation
// остаётся «активным» и всё новое тоже падает — пользователь застревает.
// После cleanup'а следующая команда (/start, /add_product, /products) начнёт
// заново на чистом листе.
bot.catch(async (err) => {
  const ctx = err.ctx;
  console.error(
    `[bot.catch] ошибка на update ${ctx.update.update_id}:`,
    err.error,
  );
  if (ctx.callbackQuery) {
    await ctx
      .answerCallbackQuery({ text: "Что-то пошло не так. Попробуй /start." })
      .catch(() => {});
  } else if (ctx.chat?.type === "private") {
    await ctx
      .reply("Что-то пошло не так. Используй /start, чтобы начать заново.")
      .catch(() => {});
  }
  if (ctx.chat?.id !== undefined) {
    await prisma.botSession
      .deleteMany({ where: { key: String(ctx.chat.id) } })
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
bot.use(
  conversations({
    storage: createPrismaConversationStorage<ConversationData>(),
  }),
);

bot.use(createConversation(addProductConversation, "addProductConversation"));
bot.use(createConversation(editNameConversation, "editNameConversation"));
bot.use(createConversation(editPriceConversation, "editPriceConversation"));
bot.use(createConversation(editPhotosConversation, "editPhotosConversation"));
bot.use(createConversation(addFeatureConversation, "addFeatureConversation"));

// 3. Команды (только в ЛС).
bot.command("start", privateOnly, startHandler);

bot.command("add_product", privateOnly, async (ctx) => {
  await ctx.conversation.enter("addProductConversation");
});

bot.command("products", privateOnly, productsCommand);

// /cancel — явный escape-выход из любого диалога.
// Сама очистка BotSession уже сделана middleware'ом выше; здесь просто
// подтверждаем юзеру, что текущий процесс сброшен.
bot.command("cancel", privateOnly, async (ctx) => {
  await ctx.reply("Текущий процесс отменён. Можешь начать заново.");
});

// 4. Callback-кнопки списка/меню товара.
bot.callbackQuery(/^pr:list$/, onProductsList);
bot.callbackQuery(/^pr:open:(\d+)$/, onProductOpen);
bot.callbackQuery(/^pr:togstk:(\d+)$/, onProductToggleStock);
bot.callbackQuery(/^pr:delpr:(\d+)$/, onProductDelPrompt);
bot.callbackQuery(/^pr:delyes:(\d+)$/, onProductDelConfirm);

// 5. Подменю features.
bot.callbackQuery(/^pr:fmenu:(\d+)$/, onProductEditFeatures);
bot.callbackQuery(/^pr:fdel:(\d+)$/, onFeatureDelete);

// 6. Вход в edit-conversations из меню товара / подменю features.
bot.callbackQuery(/^pr:editname:(\d+)$/, async (ctx) => {
  const match = ctx.match as RegExpMatchArray | undefined;
  const id = Number(match?.[1]);
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.conversation.enter("editNameConversation", id);
});
bot.callbackQuery(/^pr:editprice:(\d+)$/, async (ctx) => {
  const match = ctx.match as RegExpMatchArray | undefined;
  const id = Number(match?.[1]);
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.conversation.enter("editPriceConversation", id);
});
bot.callbackQuery(/^pr:editphotos:(\d+)$/, async (ctx) => {
  const match = ctx.match as RegExpMatchArray | undefined;
  const id = Number(match?.[1]);
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.conversation.enter("editPhotosConversation", id);
});
bot.callbackQuery(/^pr:fadd:(\d+)$/, async (ctx) => {
  const match = ctx.match as RegExpMatchArray | undefined;
  const id = Number(match?.[1]);
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.conversation.enter("addFeatureConversation", id);
});
