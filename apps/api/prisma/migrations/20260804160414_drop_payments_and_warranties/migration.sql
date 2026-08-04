-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_clientId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_orderId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_receivedById_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "warranties" DROP CONSTRAINT "warranties_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "warranties" DROP CONSTRAINT "warranties_clientId_fkey";

-- DropForeignKey
ALTER TABLE "warranties" DROP CONSTRAINT "warranties_motorcycleId_fkey";

-- DropForeignKey
ALTER TABLE "warranties" DROP CONSTRAINT "warranties_orderId_fkey";

-- DropForeignKey
ALTER TABLE "warranties" DROP CONSTRAINT "warranties_tenantId_fkey";

-- DropTable
DROP TABLE "payments";

-- DropTable
DROP TABLE "warranties";

-- DropEnum
DROP TYPE "PaymentMethod";

-- DropEnum
DROP TYPE "WarrantyStatus";

