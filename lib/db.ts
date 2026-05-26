import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Синглтон PrismaClient.
// В dev Next.js делает hot-reload и каждый раз создаёт новый клиент → утечки коннектов.
// Кладём клиент в globalThis, чтобы переиспользовать между перезагрузками.
// В prod — обычный new (там нет hot-reload).
//
// Prisma 7 требует driver adapter. Используем @prisma/adapter-pg + DATABASE_URL
// (pooled через PgBouncer, порт 6543) — это правильный URL для рантайма.

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined;
};

/**
 * Проверяет, является ли ошибка «ConnectionClosed» от @prisma/adapter-pg.
 * Возникает в serverless когда Supabase pooler закрыл idle-коннект, а
 * Prisma попыталась им воспользоваться. Лечится одной retry-попыткой
 * (Prisma при необходимости откроет новый коннект).
 */
function isConnectionClosedError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: string; meta?: { driverAdapterError?: { kind?: string } } };
  if (err.code === "P1017") return true;
  if (err.meta?.driverAdapterError?.kind === "ConnectionClosed") return true;
  return false;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан");

  // Supabase pooler требует TLS. Без явного ssl в config pg отдаст plain TCP,
  // на котором сервер вешает соединение → P1017 «ConnectionClosed».
  // rejectUnauthorized: false — Supabase использует свой/прокси-сертификат,
  // strict-валидация бессмысленна для serverless без правильных CA.
  const adapter = new PrismaPg({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  const base = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  // Расширение: retry на одну попытку при P1017 (ConnectionClosed).
  // Покрывает все операции (findMany, findUnique, update, transaction, raw).
  // Если retry тоже падает — ошибка пробрасывается дальше как есть.
  return base.$extends({
    query: {
      $allOperations: async ({ query, args, operation, model }) => {
        try {
          return await query(args);
        } catch (e) {
          if (isConnectionClosedError(e)) {
            console.warn(
              `[prisma] ConnectionClosed на ${model ?? "<root>"}.${operation}, retry...`
            );
            // Маленькая пауза — даём пулу шанс открыть новый коннект.
            await new Promise((r) => setTimeout(r, 50));
            return await query(args);
          }
          throw e;
        }
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
