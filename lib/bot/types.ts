import type { Context } from "grammy";
import type { Worker } from "@prisma/client";
import type { Conversation, ConversationFlavor } from "@grammyjs/conversations";

/**
 * Расширенный контекст grammY:
 * - `worker` устанавливается middleware `whitelist` (см. middleware.ts).
 * - `conversation` добавляется плагином @grammyjs/conversations (для пошаговых диалогов).
 *
 * Эквивалент `ctx.state.worker` из Express-подобных фреймворков — в grammY
 * `state` не зарезервирован, поэтому кладём worker напрямую в `ctx`.
 */
export type AppContext = ConversationFlavor<Context & { worker: Worker }>;

/**
 * Тип конversation handler-функции (используется в lib/bot/handlers/owner.ts).
 */
export type AppConversation = Conversation<AppContext, AppContext>;
