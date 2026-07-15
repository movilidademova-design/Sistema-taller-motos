-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('BICIMOTO', 'PATINETA', 'MOTO');

-- AlterEnum
ALTER TYPE "PhotoCategory" ADD VALUE 'GENERAL';

-- DropIndex
DROP INDEX "users_tenantId_email_key";

-- AlterTable
ALTER TABLE "motorcycles" ADD COLUMN     "vehicleType" "VehicleType" NOT NULL DEFAULT 'BICIMOTO';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "exitCode" TEXT NOT NULL,
ADD COLUMN     "otherAccessories" TEXT,
ADD COLUMN     "signatureUrl" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "trackingToken" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "quick_services" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quick_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accessory_options" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accessory_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_OrderToQuickService" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_OrderToQuickService_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AccessoryOptionToOrder" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AccessoryOptionToOrder_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "quick_services_tenantId_idx" ON "quick_services"("tenantId");

-- CreateIndex
CREATE INDEX "accessory_options_tenantId_idx" ON "accessory_options"("tenantId");

-- CreateIndex
CREATE INDEX "_OrderToQuickService_B_index" ON "_OrderToQuickService"("B");

-- CreateIndex
CREATE INDEX "_AccessoryOptionToOrder_B_index" ON "_AccessoryOptionToOrder"("B");

-- CreateIndex
CREATE UNIQUE INDEX "orders_trackingToken_key" ON "orders"("trackingToken");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenantId_exitCode_key" ON "orders"("tenantId", "exitCode");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "quick_services" ADD CONSTRAINT "quick_services_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_options" ADD CONSTRAINT "accessory_options_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrderToQuickService" ADD CONSTRAINT "_OrderToQuickService_A_fkey" FOREIGN KEY ("A") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_OrderToQuickService" ADD CONSTRAINT "_OrderToQuickService_B_fkey" FOREIGN KEY ("B") REFERENCES "quick_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AccessoryOptionToOrder" ADD CONSTRAINT "_AccessoryOptionToOrder_A_fkey" FOREIGN KEY ("A") REFERENCES "accessory_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AccessoryOptionToOrder" ADD CONSTRAINT "_AccessoryOptionToOrder_B_fkey" FOREIGN KEY ("B") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

