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
  deleteProductCommand,
} from "./handlers/owner";
import { addProductConversation } from "./conversations/add-product";
import {
  editProductConversation,
  type EditField,
} from "./conversations/edit-product";
import { onEditClick, onEditCancel } from "./handlers/edit";
import { onSoldClick, onRestockClick } from "./handlers/sold";
import {
  productsCommand,
  onProductsPage,
  onProductsNoop,
  onProductOpen,
  onProductEdit,
  onProductSold,
  onProductRestock,
  onProductDeletePrompt,
  onProductDeleteConfirm,
  onProductDeleteCancel,
} from "./handlers/products";
import { prisma } from "../db";

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error("BOT_TOKEN не задан в .env");
}

export const bot = new Bot<AppContext>(token);

// 1. Whitelist: отсекаем чужих, кладём worker в ctx.worker.
bot.use(whitelist);

// 1.5. Новая команда обрывает активный conversation.
//
// Без этого hook'а: если юзер в середине /add_product отправит /list_workers,
// текст «/list_workers» уходит в conversation как ввод (например, в шаг
// description) — и команда не срабатывает.
//
// Лечение: ПЕРЕД conversations() middleware проверяем — если сообщение
// начинается с команды, удаляем активную сессию из BotSession для этого чата.
// Тогда conversations() не найдёт активный диалог и пропустит update дальше,
// где он попадёт на command-handler.
bot.use(async (ctx, next) => {
  const isCommand =
    ctx.message?.entities?.some(
      (e) => e.type === "bot_command" && e.offset === 0
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
  })
);

// Регистрируем все conversation-функции по их именам.
bot.use(createConversation(addWorkerConversation, "addWorkerConversation"));
bot.use(createConversation(addCategoryConversation, "addCategoryConversation"));
bot.use(createConversation(addProductConversation, "addProductConversation"));
bot.use(
  createConversation(editProductConversation, "editProductConversation")
);

// 3. Команды (все требуют privateOnly — работают только в ЛС).
bot.command("start", privateOnly, startHandler);

// /add_product — доступна WORKER и OWNER.
// Прокидываем workerId явно — внутри conversation ctx.worker недоступен
// (см. коммент в conversations/add-product.ts).
bot.command("add_product", privateOnly, async (ctx) => {
  await ctx.conversation.enter("addProductConversation", ctx.worker.id);
});

// /products [запрос] — листалка/поиск товаров прямо в боте (WORKER и OWNER).
// Позволяет управлять товарами без служебного чата.
bot.command("products", privateOnly, productsCommand);

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

bot.command("delete_product", privateOnly, ownerOnly, deleteProductCommand);

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

// 5. Кнопки служебного чата:
//    edit:{id}            — клик в служебном чате, бот пишет в ЛС меню полей.
//    editcancel:{id}      — клик в ЛС, отмена редактирования, возврат кнопок.
//    editfield:{id}:{f}   — клик в ЛС, входит в editProductConversation.
//    sold:{id}            — заглушка до Этапа 8.

bot.callbackQuery(/^edit:(\d+)$/, onEditClick);
bot.callbackQuery(/^editcancel:(\d+)$/, onEditCancel);

bot.callbackQuery(
  /^editfield:(\d+):(photos|category|size|condition|price|description)$/,
  async (ctx) => {
    const match = ctx.match as RegExpMatchArray | undefined;
    const productId = Number(match?.[1]);
    const field = match?.[2] as EditField;
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter(
      "editProductConversation",
      productId,
      field
    );
  }
);

bot.callbackQuery(/^sold:(\d+)$/, onSoldClick);
bot.callbackQuery(/^restock:(\d+)$/, onRestockClick);

// 6. Кнопки листалки /products (управление товарами в ЛС бота).
bot.callbackQuery(/^plist:(\d+)$/, onProductsPage);
bot.callbackQuery(/^pnoop$/, onProductsNoop);
bot.callbackQuery(/^popen:(\d+)$/, onProductOpen);
bot.callbackQuery(/^pedit:(\d+)$/, onProductEdit);
bot.callbackQuery(/^psold:(\d+)$/, onProductSold);
bot.callbackQuery(/^prestk:(\d+)$/, onProductRestock);
bot.callbackQuery(/^pdel:(\d+)$/, onProductDeletePrompt);
bot.callbackQuery(/^pdely:(\d+)$/, onProductDeleteConfirm);
bot.callbackQuery(/^pdeln$/, onProductDeleteCancel);
