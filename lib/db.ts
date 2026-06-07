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
 * Проверяет, является ли ошибка транзиентной — той, что лечится retry'ем.
 *
 * На Supabase pooler ловим несколько вариантов:
 *   - P1017 ConnectionClosed: pooler закрыл idle-коннект
 *   - driverAdapterError.kind === ConnectionClosed (то же, другая обёртка)
 *   - pg ECONNRESET / EPIPE: TCP-сокет умер в момент запроса
 *   - ETIMEDOUT: коннект протух но ещё не закрылся явно
 *   - 'Connection terminated' / 'terminated unexpectedly' / 'server closed'
 *     — текстовые формулировки от node-postgres
 *
 * Все они означают одно: сетевой коннект мёртв, новая попытка с новым
 * коннектом скорее всего пройдёт.
 */
function isTransientDbError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as {
    code?: string;
    message?: string;
    meta?: { driverAdapterError?: { kind?: string } };
  };
  if (err.code === "P1017") return true;
  if (err.code === "ECONNRESET") return true;
  if (err.code === "EPIPE") return true;
  if (err.code === "ETIMEDOUT") return true;
  if (err.code === "ENOTCONN") return true;
  if (err.meta?.driverAdapterError?.kind === "ConnectionClosed") return true;
  const msg = err.message?.toLowerCase() ?? "";
  if (
    msg.includes("connection terminated") ||
    msg.includes("terminated unexpectedly") ||
    msg.includes("server closed") ||
    msg.includes("connection closed") ||
    msg.includes("read econnreset")
  ) {
    return true;
  }
  return false;
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан");

  // Supabase pooler требует TLS. Без явного ssl в config pg отдаёт plain TCP,
  // на котором сервер вешает соединение → P1017 «ConnectionClosed».
  // rejectUnauthorized: false — Supabase использует свой/прокси-сертификат,
  // strict-валидация бессмысленна для serverless без правильных CA.
  //
  // max: 1 — КРИТИЧНО для serverless на Supabase free tier.
  // Session pooler там ограничен 15 одновременных коннектов.
  // По умолчанию pg.Pool открывает до 10 коннектов ПЕР-Lambda. Если Vercel
  // развёрнет 2-3 концурентных функции (особенно на альбом фото — 10
  // webhook'ов в секунду), пул мгновенно исчерпывается:
  //   Error [DriverAdapterError]: (EMAXCONNSESSION) max clients reached
  // Дальше каждая лямбда ждёт коннект до 10с и умирает от Vercel-таймаута.
  // С max: 1 каждая лямбда держит ровно 1 коннект — 15 концурентных
  // лямбд = 15 коннектов, ровно лимит. Внутри лямбды запросы сериализуются,
  // но это копейки (миллисекунды на запрос).
  //
  // keepAlive + idle timeout: TCP keepalive чтобы Supabase pooler не убил
  // idle-коннект между запросами на warm-лямбде; idle: 5 секунд — после
  // паузы освобождаем коннект для других лямбд.
  const adapter = new PrismaPg({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 5000,
    keepAlive: true,
    ...({ keepAliveInitialDelay: 10_000 } as Record<string, number>),
  });

  const base = new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  // Расширение: retry до 2 попыток (то есть до 3 запросов всего) с
  // экспоненциальным бэкоффом при транзиентных ошибках коннекта.
  //
  // 50мс была недостаточна: иногда pg-пул не успевает поднять новый
  // коннект к Supabase за это время, и retry падает в ту же яму.
  // 150мс → 400мс — суммарно полсекунды на восстановление, заметно
  // надёжнее для serverless'а с прерывистыми коннектами.
  //
  // Покрывает все операции (findMany, findUnique, update, transaction, raw).
  return base.$extends({
    query: {
      $allOperations: async ({ query, args, operation, model }) => {
        const delays = [150, 400];
        let lastError: unknown;
        for (let attempt = 0; attempt <= delays.length; attempt++) {
          try {
            return await query(args);
          } catch (e) {
            lastError = e;
            if (!isTransientDbError(e) || attempt === delays.length) {
              throw e;
            }
            console.warn(
              `[prisma] транзиентная ошибка на ${model ?? "<root>"}.${operation}, ` +
                `попытка ${attempt + 2}/${delays.length + 1} через ${delays[attempt]}мс`,
              (e as Error)?.message
            );
            await new Promise((r) => setTimeout(r, delays[attempt]));
          }
        }
        // unreachable, но TS не видит
        throw lastError;
      },
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
