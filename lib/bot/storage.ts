import type { VersionedState } from "@grammyjs/conversations";
import { prisma } from "../db";

/**
 * Persistent storage для @grammyjs/conversations поверх Prisma.
 *
 * Зачем: на Vercel (serverless) каждый webhook-хит может попасть в свежий
 * процесс. In-memory `Map` из дефолтной реализации не выживает между запросами,
 * и пошаговые диалоги (особенно /add_product с 10 фото) теряют состояние.
 *
 * Используется простейший вариант — VersionedStateStorage<string, S>:
 * ключ — chatId (по умолчанию), значение — JSON с VersionedState.
 *
 * Если state содержит BigInt (Telegram raw обычно нет — int'ы в wire-формате
 * приходят как Number), упадёт на JSON.stringify. На этот случай — replacer.
 */

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}

export function createPrismaConversationStorage<S>(): {
  read(key: string): Promise<VersionedState<S> | undefined>;
  write(key: string, value: VersionedState<S>): Promise<void>;
  delete(key: string): Promise<void>;
} {
  return {
    async read(key) {
      const row = await prisma.botSession.findUnique({ where: { key } });
      if (!row) return undefined;
      try {
        return JSON.parse(row.value) as VersionedState<S>;
      } catch (e) {
        // Битый JSON — обычно после смены версии @grammyjs/conversations
        // или partial-write. Чистим, чтобы юзер не застрял в вечной 500.
        // Следующая команда стартует с чистого листа.
        console.error(
          `[storage] BotSession.value битый для key=${key}, чищу:`,
          e instanceof Error ? e.message : String(e),
        );
        await prisma.botSession.deleteMany({ where: { key } });
        return undefined;
      }
    },
    async write(key, value) {
      const serialized = JSON.stringify(value, replacer);
      await prisma.botSession.upsert({
        where: { key },
        create: { key, value: serialized },
        update: { value: serialized },
      });
    },
    async delete(key) {
      await prisma.botSession.deleteMany({ where: { key } });
    },
  };
}
