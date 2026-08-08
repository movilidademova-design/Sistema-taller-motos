-- CreateEnum
CREATE TYPE "PosRole" AS ENUM ('ADMIN', 'CASHIER');

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "role" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ADD COLUMN "posRole" "PosRole";

-- Nadie puede quedar sin acceso a ningún sistema. Los usuarios que ya existen
-- conservan su rol de taller, así que ninguna fila viola esto al aplicarse.
ALTER TABLE "users" ADD CONSTRAINT "users_at_least_one_role"
  CHECK ("role" IS NOT NULL OR "posRole" IS NOT NULL);
