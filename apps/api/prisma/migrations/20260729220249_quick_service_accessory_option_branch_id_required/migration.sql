-- DropIndex
DROP INDEX "accessory_options_tenantId_label_key";

-- DropIndex
DROP INDEX "quick_services_tenantId_label_key";

-- AlterTable
ALTER TABLE "accessory_options" ALTER COLUMN "branchId" SET NOT NULL;

-- AlterTable
ALTER TABLE "quick_services" ALTER COLUMN "branchId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "accessory_options_tenantId_branchId_label_key" ON "accessory_options"("tenantId", "branchId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "quick_services_tenantId_branchId_label_key" ON "quick_services"("tenantId", "branchId", "label");
