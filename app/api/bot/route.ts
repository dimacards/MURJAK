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
 * Защита: ВСЕГДА отвечаем 200, даже если bot.process выбросил наружу
 * необработанный exception. Telegram иначе считал бы доставку неудачной
 * и крутил ретраи, забивая очередь.
 *
 * Расширенный лог: message + stack, чтобы в Vercel → Logs можно было найти
 * виновного по строке/файлу. До этой версии писали просто `e` — Vercel UI
 * урезал его до префикса.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    return await handler(req);
  } catch (e) {
    const err = e as Error & { code?: string };
    console.error(
      "[webhook] uncaught error from bot.process — отдаю 200.",
      "\n  name:",
      err?.name,
      "\n  code:",
      err?.code,
      "\n  message:",
      err?.message,
      "\n  stack:",
      err?.stack,
    );
    return new Response("OK", { status: 200 });
  }
}
