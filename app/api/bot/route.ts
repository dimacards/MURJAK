// Заглушка — настоящий webhook бота будет в этапе 3, когда перепишем lib/bot
// под новую модель. Сейчас старый lib/bot ссылается на снесённые поля Prisma
// (category/size/condition/status), поэтому импорт оттуда уронит сборку.
//
// До этапа 3 webhook на этом URL не зарегистрирован у Telegram, никто сюда
// не приходит — заглушка просто отвечает 200, чтобы маршрут существовал.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return new Response("Bot webhook not configured yet (stage 3)", {
    status: 200,
  });
}
