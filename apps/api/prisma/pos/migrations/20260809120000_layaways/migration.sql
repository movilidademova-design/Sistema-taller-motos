-- CreateEnum
CREATE TYPE "PosLayawayStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "pos_layaways" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientDoc" TEXT NOT NULL DEFAULT '',
    "clientPhone" TEXT NOT NULL DEFAULT '',
    "total" DECIMAL(12,2) NOT NULL,
    "generalDiscount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL,
    "status" "PosLayawayStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT NOT NULL DEFAULT '',
    "saleId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_layaways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_layaway_items" (
    "id" TEXT NOT NULL,
    "layawayId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "finalPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '',
    "supplier" TEXT NOT NULL DEFAULT '',
    "engineNumber" TEXT,
    "chassisNumber" TEXT,

    CONSTRAINT "pos_layaway_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_layaway_payments" (
    "id" TEXT NOT NULL,
    "layawayId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "receiptNumber" INTEGER,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "pos_layaway_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_layaways_tenantId_branchId_status_idx" ON "pos_layaways"("tenantId", "branchId", "status");

-- CreateIndex
CREATE INDEX "pos_layaway_items_layawayId_idx" ON "pos_layaway_items"("layawayId");

-- CreateIndex
CREATE INDEX "pos_layaway_payments_layawayId_idx" ON "pos_layaway_payments"("layawayId");

-- CreateIndex
CREATE UNIQUE INDEX "pos_layaway_payments_layawayId_receiptNumber_key" ON "pos_layaway_payments"("layawayId", "receiptNumber");

-- AddForeignKey
ALTER TABLE "pos_layaway_items" ADD CONSTRAINT "pos_layaway_items_layawayId_fkey" FOREIGN KEY ("layawayId") REFERENCES "pos_layaways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_layaway_items" ADD CONSTRAINT "pos_layaway_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pos_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_layaway_payments" ADD CONSTRAINT "pos_layaway_payments_layawayId_fkey" FOREIGN KEY ("layawayId") REFERENCES "pos_layaways"("id") ON DELETE CASCADE ON UPDATE CASCADE;

