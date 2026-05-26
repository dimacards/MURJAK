import type { AppContext } from "../types";

/**
 * Заглушка для команд, реальные реализации которых появятся на следующих этапах.
 * Имена команд, для которых это используется — в lib/bot/index.ts.
 */
export async function stubHandler(ctx: AppContext): Promise<void> {
  const cmd = ctx.message?.text?.split(/\s+/)[0] ?? "Эта команда";
  await ctx.reply(`${cmd} — будет на следующем этапе.`);
}
