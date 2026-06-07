// Устанавливает меню команд бота через setMyCommands. После этого:
//   - в чате с ботом слева внизу появится кнопка-меню «Меню»
//   - при вводе слеша «/» появляется выпадающий список команд с описанием
//
// Команды — общие, так как работник в боте один.
//
// Запуск (один раз после деплоя нового бота):
//   npx tsx scripts/set-bot-commands.ts

import "dotenv/config";
import { Bot } from "grammy";

const COMMANDS = [
  { command: "start", description: "Информация о боте" },
  { command: "add_product", description: "Добавить товар" },
  { command: "products", description: "Список товаров — редактирование" },
];

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN не задан в .env");

  const bot = new Bot(token);

  // Скоупим на all_private_chats: бот не предназначен для групп.
  await bot.api.setMyCommands(COMMANDS, {
    scope: { type: "all_private_chats" },
  });
  console.log("✓ Commands set (scope: all_private_chats)");
  for (const c of COMMANDS) console.log(`    /${c.command} — ${c.description}`);
  console.log(
    "\nГотово. В Telegram в ЛС с ботом слева внизу появится кнопка «Меню», " +
      "а при вводе «/» — выпадающий список команд.",
  );
}

main().catch((e) => {
  console.error("✗ failed:", e);
  process.exit(1);
});
