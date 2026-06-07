import type { AppContext } from "../types";

/**
 * /start — приветствие и список доступных команд.
 * Шлётся работнику (whitelist уже пропустил, иначе сюда не дошло бы).
 */
export async function startHandler(ctx: AppContext): Promise<void> {
  const text =
    "Привет! Это бот управления товарами MURJAK.\n\n" +
    "Доступные команды:\n" +
    "/add_product — добавить товар (появится в этапе 4)\n" +
    "/products — список товаров для редактирования (появится в этапе 5)";

  await ctx.reply(text);
}
