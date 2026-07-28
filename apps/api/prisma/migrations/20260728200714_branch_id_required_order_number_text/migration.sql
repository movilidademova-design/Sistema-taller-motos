-- AlterTable: clients.branchId is now required (fully backfilled in a prior task)
ALTER TABLE "clients" ALTER COLUMN "branchId" SET NOT NULL;

-- AlterTable: motorcycles.branchId is now required (fully backfilled in a prior task)
ALTER TABLE "motorcycles" ALTER COLUMN "branchId" SET NOT NULL;

-- AlterTable: orders.branchId is now required (fully backfilled in a prior task)
ALTER TABLE "orders" ALTER COLUMN "branchId" SET NOT NULL;

-- DropIndex: old unique constraint on the numeric orderNumber column
DROP INDEX "orders_tenantId_orderNumber_key";

-- AlterTable: drop the old numeric orderNumber column
ALTER TABLE "orders" DROP COLUMN "orderNumber";

-- AlterTable: rename orderNumberText (already backfilled with branch-prefixed
-- values like "00010001") to orderNumber, preserving all existing data
ALTER TABLE "orders" RENAME COLUMN "orderNumberText" TO "orderNumber";

-- AlterTable: the renamed column is now required
ALTER TABLE "orders" ALTER COLUMN "orderNumber" SET NOT NULL;

-- CreateIndex: re-create the unique constraint on the new text column
CREATE UNIQUE INDEX "orders_tenantId_orderNumber_key" ON "orders"("tenantId", "orderNumber");
