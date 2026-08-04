-- AlterEnum
BEGIN;
CREATE TYPE "QuotationItemType_new" AS ENUM ('PART', 'OTHER');
ALTER TABLE "quotation_items" ALTER COLUMN "type" TYPE "QuotationItemType_new" USING ("type"::text::"QuotationItemType_new");
ALTER TYPE "QuotationItemType" RENAME TO "QuotationItemType_old";
ALTER TYPE "QuotationItemType_new" RENAME TO "QuotationItemType";
DROP TYPE "public"."QuotationItemType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "QuotationStatus_new" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'READY_TO_SEND', 'SENT', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED');
ALTER TABLE "public"."quotations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "quotations" ALTER COLUMN "status" TYPE "QuotationStatus_new" USING ("status"::text::"QuotationStatus_new");
ALTER TYPE "QuotationStatus" RENAME TO "QuotationStatus_old";
ALTER TYPE "QuotationStatus_new" RENAME TO "QuotationStatus";
DROP TYPE "public"."QuotationStatus_old";
ALTER TABLE "quotations" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterTable
ALTER TABLE "quotations" DROP COLUMN "laborCost",
ADD COLUMN     "pdfUrl" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "quotation_status_history" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "fromStatus" "QuotationStatus",
    "toStatus" "QuotationStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotation_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotation_status_history_quotationId_idx" ON "quotation_status_history"("quotationId");

-- AddForeignKey
ALTER TABLE "quotation_status_history" ADD CONSTRAINT "quotation_status_history_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_status_history" ADD CONSTRAINT "quotation_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

