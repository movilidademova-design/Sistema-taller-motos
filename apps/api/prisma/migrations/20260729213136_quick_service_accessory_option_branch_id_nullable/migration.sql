-- AlterTable
ALTER TABLE "accessory_options" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "quick_services" ADD COLUMN     "branchId" TEXT;

-- CreateIndex
CREATE INDEX "accessory_options_branchId_idx" ON "accessory_options"("branchId");

-- CreateIndex
CREATE INDEX "quick_services_branchId_idx" ON "quick_services"("branchId");

-- AddForeignKey
ALTER TABLE "quick_services" ADD CONSTRAINT "quick_services_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accessory_options" ADD CONSTRAINT "accessory_options_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
