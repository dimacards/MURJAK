import { Bot } from "grammy";
import {
  conversations,
  createConversation,
  type ConversationData,
} from "@grammyjs/conversations";
import type { AppContext } from "./types";
import { ownerOnly, privateOnly, whitelist } from "./middleware";
import { createPrismaConversationStorage } from "./storage";
import { startHandler } from "./handlers/start";
import {
  addWorkerConversation,
  addCategoryConversation,
  removeWorkerCommand,
  removeCategoryCommand,
  listWorkersCommand,
  listCategoriesCommand,
  onRemoveWorkerCallback,
  onRemoveCategoryCallback,
} from "./handlers/owner";
import { addProductConversation } from "./conversations/add-product";

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error("BOT_TOKEN не задан в .env");
}

export const bot = new Bot<AppContext>(token);

// 1. Whitelist: отсекаем чужих, кладём worker в ctx.worker.
bot.use(whitelist);

// 2. Conversations плагин с Prisma-storage (BotSession в БД).
// In-memory не работает на Vercel: каждый webhook-хит — потенциально
// свежий serverless процесс, in-memory Map не выживает между ними.
bot.use(
  conversations({
    storage: createPrismaConversationStorage<ConversationData>(),
  })
);

// Регистрируем все conversation-функции по их именам.
bot.use(createConversation(addWorkerConversation, "addWorkerConversation"));
bot.use(createConversation(addCategoryConversation, "addCategoryConversation"));
bot.use(createConversation(addProductConversation, "addProductConversation"));

// 3. Команды (все требуют privateOnly — работают только в ЛС).
bot.command("start", privateOnly, startHandler);

// /add_product — доступна WORKER и OWNER.
// Прокидываем workerId явно — внутри conversation ctx.worker недоступен
// (см. коммент в conversations/add-product.ts).
bot.command("add_product", privateOnly, async (ctx) => {
  await ctx.conversation.enter("addProductConversation", ctx.worker.id);
});

// OWNER-only команды.
bot.command("add_worker", privateOnly, ownerOnly, async (ctx) => {
  await ctx.conversation.enter("addWorkerConversation");
});
bot.command("remove_worker", privateOnly, ownerOnly, removeWorkerCommand);
bot.command("list_workers", privateOnly, ownerOnly, listWorkersCommand);

bot.command("add_category", privateOnly, ownerOnly, async (ctx) => {
  await ctx.conversation.enter("addCategoryConversation");
});
bot.command("remove_category", privateOnly, ownerOnly, removeCategoryCommand);
bot.command("list_categories", privateOnly, ownerOnly, listCategoriesCommand);

// 4. Callback-кнопки для inline-меню (тоже OWNER-only).
bot.callbackQuery(
  /^rm_worker:(\d+|cancel)$/,
  ownerOnly,
  onRemoveWorkerCallback
);
bot.callbackQuery(
  /^rm_cat:(\d+|cancel)$/,
  ownerOnly,
  onRemoveCategoryCallback
);

// 5. Кнопки служебного чата (edit:/sold:) — пока заглушки, доступны любому
// whitelisted работнику. Реальная логика на Этапах 7 (edit) и 8 (sold).
bot.callbackQuery(/^edit:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({
    text: "Редактирование товара — на следующем этапе.",
    show_alert: true,
  });
});

bot.callbackQuery(/^sold:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({
    text: "Пометка «Нет в наличии» — на следующем этапе.",
    show_alert: true,
  });
});
