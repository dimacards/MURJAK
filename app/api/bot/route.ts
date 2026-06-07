import { webhookCallback } from "grammy";
import { bot } from "@/lib/bot";

// Prisma и grammY требуют Node.js runtime (не Edge).
export const runtime = "nodejs";
// Webhook — всегда динамический, кэшировать нельзя.
export const dynamic = "force-dynamic";

/**
 * POST /api/bot — webhook от Telegram.
 *
 * Telegram шлёт сюда апдейты после `setWebhook`. grammY обрабатывает их через
 * webhookCallback с адаптером "std/http" (Web standard Request/Response).
 */
export const POST = webhookCallback(bot, "std/http");
