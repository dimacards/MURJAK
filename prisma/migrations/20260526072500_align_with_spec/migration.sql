/*
  Warnings:

  - You are about to drop the column `serviceChatMessageId` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "telegramFileId" TEXT;

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "serviceChatMessageId",
ADD COLUMN     "serviceMediaMessageIds" INTEGER[],
ADD COLUMN     "serviceMessageId" INTEGER;
