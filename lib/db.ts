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
  prisma: PrismaClient | undefined;
};

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан");
  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
