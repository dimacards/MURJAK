import type { AppContext } from "../types";

const COMMON_COMMANDS = [
  "/add_product — добавить товар",
  "/products — список товаров (редактировать, продать, удалить)",
];

const OWNER_COMMANDS = [
  ...COMMON_COMMANDS,
  "/workers — работники (добавить / удалить)",
  "/categories — категории (добавить / удалить)",
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
