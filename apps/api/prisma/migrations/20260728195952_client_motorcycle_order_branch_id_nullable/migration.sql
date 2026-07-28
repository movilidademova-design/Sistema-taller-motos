-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "motorcycles" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "branchId" TEXT;

-- CreateIndex
CREATE INDEX "clients_branchId_idx" ON "clients"("branchId");

-- CreateIndex
CREATE INDEX "motorcycles_branchId_idx" ON "motorcycles"("branchId");

-- CreateIndex
CREATE INDEX "orders_branchId_idx" ON "orders"("branchId");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motorcycles" ADD CONSTRAINT "motorcycles_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
