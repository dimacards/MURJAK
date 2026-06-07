-- Включаем RLS на всех таблицах. Политик не добавляем: наш бот ходит
-- напрямую через postgres-коннект (DATABASE_URL), который обходит RLS.
-- Публичный Supabase REST с anon-ключом теперь не сможет ничего прочитать.
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Photo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Feature" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BotSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
