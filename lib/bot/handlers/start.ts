import type { AppContext } from "../types";

const COMMON_COMMANDS = [
  "/add_product — добавить товар",
  "/products — список товаров (редактировать, продать, удалить)",
];

const OWNER_COMMANDS = [
  ...COMMON_COMMANDS,
  "/add_worker — добавить работника",
  "/list_workers — работники (+ удаление)",
  "/add_category — добавить категорию",
  "/list_categories — категории (+ удаление)",
];

const WORKER_COMMANDS = COMMON_COMMANDS;

export async function startHandler(ctx: AppContext): Promise<void> {
  const w = ctx.worker;
  const cmds = w.role === "OWNER" ? OWNER_COMMANDS : WORKER_COMMANDS;

  const text =
    `Здравствуй, ${w.name}! Твоя роль: ${w.role}.\n\n` +
    `Доступные команды:\n${cmds.join("\n")}\n\n` +
    `Чтобы отредактировать, продать или удалить товар — открой /products, ` +
    `найди нужный и нажми на него.`;

  await ctx.reply(text);
}
