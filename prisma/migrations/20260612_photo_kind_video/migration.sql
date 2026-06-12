-- Тип фото (на модели / сама вещь) + опциональное видео у товара.
CREATE TYPE "PhotoKind" AS ENUM ('MODEL', 'ITEM');

ALTER TABLE "Photo" ADD COLUMN "kind" "PhotoKind" NOT NULL DEFAULT 'ITEM';

ALTER TABLE "Product" ADD COLUMN "videoStoragePath" TEXT;
ALTER TABLE "Product" ADD COLUMN "videoPublicUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN "videoTelegramFileId" TEXT;
