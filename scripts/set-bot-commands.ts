// Устанавливает меню команд бота через setMyCommands. После этого:
//   - в чате с ботом слева внизу появится кнопка-меню «Меню»
//   - при вводе слеша «/» появляется выпадающий список команд с описанием
//
// Команды разделены по scope:
//   - WORKER_COMMANDS — все приватные чаты (видят все whitelisted работники)
//   - OWNER_COMMANDS  — только ЛС владельца (включает админ-команды)
//
// Запуск (один раз после деплоя нового бота):
//   npx tsx scripts/set-bot-commands.ts

import "dotenv/config";
import { Bot } from "grammy";

const WORKER_COMMANDS = [
  { command: "start", description: "Информация о боте" },
  { command: "add_product", description: "Добавить товар" },
  { command: "products", description: "Список товаров — править/продать/удалить" },
];

const OWNER_COMMANDS = [
  ...WORKER_COMMANDS,
  { command: "add_worker", description: "Добавить работника" },
  { command: "remove_worker", description: "Удалить работника" },
  { command: "list_workers", description: "Список работников" },
  { command: "add_category", description: "Добавить категорию" },
  { command: "remove_category", description: "Удалить категорию" },
  { command: "list_categories", description: "Список категорий" },
  { command: "delete_product", description: "Удалить товар по id или названию" },
];

async function main() {
  const token = process.env.BOT_TOKEN;
  const ownerIdRaw = process.env.OWNER_TELEGRAM_ID;
  if (!token) throw new Error("BOT_TOKEN не задан в .env");
  if (!ownerIdRaw) throw new Error("OWNER_TELEGRAM_ID не задан в .env");

  const bot = new Bot(token);

  // 1. Команды для всех приватных чатов (для WORKER'ов).
  await bot.api.setMyCommands(WORKER_COMMANDS, {
    scope: { type: "all_private_chats" },
  });
  console.log("✓ WORKER commands set (scope: all_private_chats)");
  for (const c of WORKER_COMMANDS) console.log(`    /${c.command} — ${c.description}`);

  // 2. Расширенный список — только в ЛС владельца.
  // Telegram отдаёт наиболее специфичный scope, так что у OWNER будет именно
  // этот список. Чтобы это сработало, OWNER должен хотя бы раз написать /start
  // боту (иначе bot не знает о его приватном чате — впрочем, setMyCommands
  // с scope chat работает по chat_id без предварительного контакта).
  await bot.api.setMyCommands(OWNER_COMMANDS, {
    scope: { type: "chat", chat_id: Number(ownerIdRaw) },
  });
  console.log("\n✓ OWNER commands set (scope: chat, OWNER_TELEGRAM_ID)");
  for (const c of OWNER_COMMANDS) console.log(`    /${c.command} — ${c.description}`);

  console.log(
    "\nГотово. В Telegram у работников в ЛС с ботом слева внизу появится кнопка «Меню».\n" +
      "При вводе слеша «/» — выпадающий список команд."
  );
}

main().catch((e) => {
  console.error("✗ failed:", e);
  process.exit(1);
});
