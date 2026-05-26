import { Bot } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import type { AppContext } from "./types";
import { ownerOnly, privateOnly, whitelist } from "./middleware";
import { startHandler } from "./handlers/start";
import { stubHandler } from "./handlers/stubs";
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

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error("BOT_TOKEN не задан в .env");
}

export const bot = new Bot<AppContext>(token);

// 1. Whitelist: отсекаем чужих, кладём worker в ctx.worker.
bot.use(whitelist);

// 2. Conversations плагин (in-memory storage по умолчанию).
//
// ⚠️ На Vercel serverless состояние конversation теряется при cold-start
// между двумя сообщениями пользователя. Для коротких диалогов (2 шага)
// это срабатывает в большинстве случаев, но для /add_product (Этап 4)
// надо будет подключить персистентный storage (например, через Prisma).
bot.use(conversations());

// Регистрируем все conversation-функции по их именам.
bot.use(createConversation(addWorkerConversation, "addWorkerConversation"));
bot.use(createConversation(addCategoryConversation, "addCategoryConversation"));

// 3. Команды (все требуют privateOnly — работают только в ЛС).
bot.command("start", privateOnly, startHandler);

// /add_product — заглушка до следующего этапа.
bot.command("add_product", privateOnly, stubHandler);

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
