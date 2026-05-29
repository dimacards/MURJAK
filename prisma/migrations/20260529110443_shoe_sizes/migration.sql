-- CreateEnum
CREATE TYPE "SizeType" AS ENUM ('CLOTHING', 'SHOE');

-- AlterTable: тип размерной сетки у категории (по умолчанию одежда)
ALTER TABLE "Category" ADD COLUMN     "sizeType" "SizeType" NOT NULL DEFAULT 'CLOTHING';

-- AlterTable: size enum -> text с сохранением данных (XS..XXL станут строками)
ALTER TABLE "Product" ALTER COLUMN "size" TYPE TEXT USING "size"::text;

-- DropEnum: enum Size больше не нужен
DROP TYPE "Size";
