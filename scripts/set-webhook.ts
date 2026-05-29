// Устанавливает webhook бота на URL из NEXT_PUBLIC_SITE_URL.
//
// Запуск:
//   npx tsx scripts/set-webhook.ts
//
// Делать это нужно один раз после каждого деплоя на новый домен
// (или после смены BOT_TOKEN). Telegram сам ничего не меняет автоматически.

import "dotenv/config";

async function main() {
  const token = process.env.BOT_TOKEN;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  if (!token) throw new Error("BOT_TOKEN не задан в .env");
  if (!siteUrl) throw new Error("NEXT_PUBLIC_SITE_URL не задан в .env");

  if (
    siteUrl.startsWith("http://localhost") ||
    siteUrl.startsWith("http://127.")
  ) {
    console.error(
      "⚠️  NEXT_PUBLIC_SITE_URL указывает на localhost — Telegram требует публичный HTTPS-URL для webhook."
    );
    console.error(
      "    Запусти этот скрипт после деплоя (например, на Vercel)."
    );
    process.exit(1);
  }

  if (!siteUrl.startsWith("https://")) {
    console.error("⚠️  NEXT_PUBLIC_SITE_URL должен начинаться с https://");
    process.exit(1);
  }

  const webhookUrl = `${siteUrl.replace(/\/$/, "")}/api/bot`;
  console.log(`Ставим webhook: ${webhookUrl}\n`);

  const setRes = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        drop_pending_updates: true,
        allowed_updates: ["message", "callback_query"],
        // Последовательная доставка апдейтов: следующий webhook стартует
        // только после ответа на предыдущий. Это защищает от дабл-тапа
        // «Опубликовать» (два клика не обработаются параллельно на разных
        // serverless-инстансах).
        max_connections: 1,
      }),
    }
  );
  const setData = (await setRes.json()) as unknown;
  console.log("setWebhook →", setData);

  const infoRes = await fetch(
    `https://api.telegram.org/bot${token}/getWebhookInfo`
  );
  const info = (await infoRes.json()) as unknown;
  console.log("\ngetWebhookInfo →", JSON.stringify(info, null, 2));
}

main().catch((e) => {
  console.error("✗ failed:", e);
  process.exit(1);
});
