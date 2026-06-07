import type { AppContext } from "../types";

/**
 * /start — приветствие и список доступных команд.
 */
export async function startHandler(ctx: AppContext): Promise<void> {
  const text =
    "Привет! Это бот управления товарами MURJAK.\n\n" +
    "Команды:\n" +
    "/add_product — добавить товар\n" +
    "/products — список товаров для редактирования (появится в этапе 5)\n\n" +
    "В любой момент во время добавления — /cancel отменяет процесс.";

  await ctx.reply(text);
}
