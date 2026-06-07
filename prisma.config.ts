import path from "node:path";
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const directUrl = process.env.DIRECT_URL;
if (!directUrl) throw new Error("DIRECT_URL не задан в .env");

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: directUrl,
  },
  // Driver adapter используется и в рантайме, и в миграциях. Supabase pooler
  // требует TLS — нативный rust-engine миграций без SSL-конфига получает P1017
  // «Server has closed the connection», поэтому идём через PrismaPg с явным ssl.
  adapter: () =>
    Promise.resolve(
      new PrismaPg({
        connectionString: directUrl,
        ssl: { rejectUnauthorized: false },
        keepAlive: true,
      }),
    ),
});
