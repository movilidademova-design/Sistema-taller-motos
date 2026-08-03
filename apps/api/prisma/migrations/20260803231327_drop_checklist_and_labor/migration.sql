-- DropForeignKey
ALTER TABLE "checklist_items" DROP CONSTRAINT "checklist_items_orderId_fkey";

-- DropForeignKey
ALTER TABLE "labor_entries" DROP CONSTRAINT "labor_entries_orderId_fkey";

-- DropForeignKey
ALTER TABLE "labor_entries" DROP CONSTRAINT "labor_entries_technicianId_fkey";

-- DropTable
DROP TABLE "checklist_items";

-- DropTable
DROP TABLE "labor_entries";

-- DropEnum
DROP TYPE "ChecklistItemType";

-- DropEnum
DROP TYPE "ConditionRating";
