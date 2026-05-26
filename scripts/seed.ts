// Заполняет БД тестовыми данными: одна категория «футболка» и один владелец.
// НЕ запускается автоматически. Запуск вручную:
//
//   npx tsx scripts/seed.ts
//
// Скрипт идемпотентен: повторный запуск ничего не ломает.

import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  const ownerTelegramIdRaw = process.env.OWNER_TELEGRAM_ID;
  if (!ownerTelegramIdRaw) {
    throw new Error("OWNER_TELEGRAM_ID не задан в .env");
  }
  const ownerTelegramId = BigInt(ownerTelegramIdRaw);

  // 1. Категория «футболка»
  const category = await prisma.category.upsert({
    where: { name: "футболка" },
    update: {},
    create: { name: "футболка" },
  });
  console.log(`✓ category: ${category.name} (id=${category.id})`);

  // 2. Владелец
  const owner = await prisma.worker.upsert({
    where: { telegramId: ownerTelegramId },
    update: { role: "OWNER" },
    create: {
      telegramId: ownerTelegramId,
      name: "Тестовый владелец",
      role: "OWNER",
    },
  });
  console.log(
    `✓ owner: ${owner.name} (telegramId=${owner.telegramId}, role=${owner.role})`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("✗ seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
