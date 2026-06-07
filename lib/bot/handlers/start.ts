import type { AppContext } from "../types";

/**
 * /start — приветствие и список доступных команд.
 */
export async function startHandler(ctx: AppContext): Promise<void> {
  const text =
    "Привет! Это бот управления товарами MURJAK.\n\n" +
    "Команды:\n" +
    "/add_product — добавить товар\n" +
    "/products — список товаров (редактирование, наличие, удаление)\n\n" +
    "Во время добавления/редактирования: /cancel или кнопка «❌ Отмена» — обрывают процесс.";

  await ctx.reply(text);
}
