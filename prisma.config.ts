import path from "node:path";
import { defineConfig } from "prisma/config";
import "dotenv/config";

const directUrl = process.env.DIRECT_URL;
if (!directUrl) throw new Error("DIRECT_URL не задан в .env");

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  // URL для миграций Prisma (migrate status/diff/resolve). Driver adapter
  // в Prisma 7 в prisma.config не объявляется как тип-поле — он подключается
  // в рантайме в lib/db.ts. Сами миграции на Supabase мы применяем напрямую
  // через рабочий pg-коннект (migrate dev/db push не работают — нет shadow DB).
  datasource: {
    url: directUrl,
  },
});
