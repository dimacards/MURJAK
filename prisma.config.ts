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
  // URL для миграций (prisma migrate dev/deploy) — direct connection 5432,
  // т.к. миграции не работают через PgBouncer в transaction mode.
  // Driver adapter (PrismaPg) подключается в рантайме в lib/db.ts.
  datasource: {
    url: directUrl,
  },
});
