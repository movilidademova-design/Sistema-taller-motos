-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('BICIMOTO', 'PATINETA', 'MOTO');

-- AlterTable
ALTER TABLE "motorcycles" ADD COLUMN     "vehicleType" "VehicleType" NOT NULL DEFAULT 'MOTO';

-- AlterTable
ALTER TABLE "order_photos" ALTER COLUMN "category" DROP NOT NULL;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "pickupCode" TEXT,
ADD COLUMN     "pickupCodeVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "signatureUrl" TEXT,
ADD COLUMN     "signedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "quick_services" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quick_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_services_tenantId_idx" ON "quick_services"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "quick_services_tenantId_label_key" ON "quick_services"("tenantId", "label");

-- AddForeignKey
ALTER TABLE "quick_services" ADD CONSTRAINT "quick_services_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill pickup codes for orders created before this feature existed
UPDATE "orders"
SET "pickupCode" = lpad(floor(random() * 900000 + 100000)::int::text, 6, '0')
WHERE "pickupCode" IS NULL;
