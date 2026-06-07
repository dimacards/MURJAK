import { webhookCallback } from "grammy";
import { bot } from "@/lib/bot";

// Prisma и grammY требуют Node.js runtime (не Edge).
export const runtime = "nodejs";
// Webhook — всегда динамический, кэшировать нельзя.
export const dynamic = "force-dynamic";

const handler = webhookCallback(bot, "std/http");

/**
 * POST /api/bot — webhook от Telegram.
 *
 * Telegram шлёт сюда апдейты после `setWebhook`.
 *
 * Защита: ВСЕГДА отвечаем 200, даже если bot.process выбросил наружу
 * необработанный exception. Иначе Telegram считает update недоставленным
 * и крутит ретраи каждые ~секунды — очередь забивается, бот тормозит
 * на час-другой, пока retry-окно не истечёт. Лучше потерять один upset,
 * чем зависнуть весь поток.
 *
 * Реальная причина ошибки — в Vercel Functions → Logs (console.error).
 */
export async function POST(req: Request): Promise<Response> {
  try {
    return await handler(req);
  } catch (e) {
    console.error(
      "[webhook] uncaught error из bot.process — отдаю 200, чтобы не было ретраев:",
      e,
    );
    return new Response("OK", { status: 200 });
  }
}
