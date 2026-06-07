import type { Context } from "grammy";
import type { Conversation, ConversationFlavor } from "@grammyjs/conversations";

/**
 * Расширенный контекст grammY:
 * - `conversation` добавляется плагином @grammyjs/conversations для пошаговых диалогов.
 *
 * Без таблицы Worker: единственный авторизованный пользователь — это
 * WORKER_TELEGRAM_ID из .env. Whitelist-middleware просто сравнивает
 * `ctx.from.id` с этим числом и ничего не кладёт в контекст.
 */
export type AppContext = ConversationFlavor<Context>;

/**
 * Тип conversation-handler функции (для будущих /add_product, /products).
 */
export type AppConversation = Conversation<AppContext, AppContext>;
