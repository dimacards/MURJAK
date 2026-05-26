import { Bot } from "grammy";
import type { AppContext } from "./types";
import { privateOnly, whitelist } from "./middleware";
import { startHandler } from "./handlers/start";
import { stubHandler } from "./handlers/stubs";

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error("BOT_TOKEN не задан в .env");
}

export const bot = new Bot<AppContext>(token);

// 1. Whitelist на каждое обновление: отсекает чужих, кладёт worker в ctx.worker.
bot.use(whitelist);

// 2. Команды — только в ЛС.
bot.command("start", privateOnly, startHandler);

// 3. Команды-заглушки (реализация на следующих этапах).
// /add_product доступен и WORKER, и OWNER; остальные — только OWNER (role-check
// добавим вместе с реализацией, сейчас просто заглушка для всех whitelisted).
const STUB_COMMANDS = [
  "add_product",
  "add_worker",
  "remove_worker",
  "list_workers",
  "add_category",
  "remove_category",
  "list_categories",
];

for (const cmd of STUB_COMMANDS) {
  bot.command(cmd, privateOnly, stubHandler);
}
