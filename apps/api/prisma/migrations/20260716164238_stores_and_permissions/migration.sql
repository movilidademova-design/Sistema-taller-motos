-- AlterEnum (Role: add VIEWER, drop CLIENT — no existing rows use CLIENT)
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'MANAGER', 'RECEPTIONIST', 'TECHNICIAN', 'VIEWER');
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'RECEPTIONIST';
COMMIT;

-- CreateTable: stores (created before storeId columns so we can backfill into it)
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stores_tenantId_idx" ON "stores"("tenantId");
CREATE UNIQUE INDEX "stores_tenantId_code_key" ON "stores"("tenantId", "code");
ALTER TABLE "stores" ADD CONSTRAINT "stores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: user_store_memberships
CREATE TABLE "user_store_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_store_memberships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_store_memberships_storeId_idx" ON "user_store_memberships"("storeId");
CREATE UNIQUE INDEX "user_store_memberships_userId_storeId_key" ON "user_store_memberships"("userId", "storeId");
ALTER TABLE "user_store_memberships" ADD CONSTRAINT "user_store_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_store_memberships" ADD CONSTRAINT "user_store_memberships_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: user_permission_overrides
CREATE TABLE "user_permission_overrides" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_permission_overrides_userId_permission_key" ON "user_permission_overrides"("userId", "permission");
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: expenses (brand new, no backfill needed)
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "expenseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expenses_tenantId_storeId_idx" ON "expenses"("tenantId", "storeId");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one "Sucursal Principal" store per existing tenant, and a membership
-- for every existing user against it, so nothing is left orphaned.
INSERT INTO "stores" ("id", "tenantId", "name", "code", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", 'Sucursal Principal', 'PRINCIPAL', true, now(), now()
FROM "tenants";

INSERT INTO "user_store_memberships" ("id", "userId", "storeId", "createdAt")
SELECT gen_random_uuid(), u."id", s."id", now()
FROM "users" u
JOIN "stores" s ON s."tenantId" = u."tenantId" AND s."code" = 'PRINCIPAL';

-- AlterTable: add storeId (nullable first), backfill, then enforce NOT NULL + FK.
ALTER TABLE "clients" ADD COLUMN "storeId" TEXT;
ALTER TABLE "motorcycles" ADD COLUMN "storeId" TEXT;
ALTER TABLE "orders" ADD COLUMN "storeId" TEXT;
ALTER TABLE "categories" ADD COLUMN "storeId" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "storeId" TEXT;
ALTER TABLE "products" ADD COLUMN "storeId" TEXT;
ALTER TABLE "inventory_movements" ADD COLUMN "storeId" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "storeId" TEXT;
ALTER TABLE "warranties" ADD COLUMN "storeId" TEXT;
ALTER TABLE "payments" ADD COLUMN "storeId" TEXT;
ALTER TABLE "invoices" ADD COLUMN "storeId" TEXT;
ALTER TABLE "appointments" ADD COLUMN "storeId" TEXT;
ALTER TABLE "quick_services" ADD COLUMN "storeId" TEXT;
ALTER TABLE "accessory_options" ADD COLUMN "storeId" TEXT;

UPDATE "clients" t SET "storeId" = s."id" FROM "stores" s WHERE s."tenantId" = t."tenantId" AND s."code" = 'PRINCIPAL';
UPDATE "motorcycles" t SET "storeId" = s."id" FROM "stores" s WHERE s."tenantId" = t."tenantId" AND s."code" = 'PRINCIPAL';
UPDATE "orders" t SET "storeId" = s."id" FROM "stores" s WHERE s."tenantId" = t."tenantId" AND s."code" = 'PRINCIPAL';
UPDATE "categories" t SET "storeId" = s."id" FROM "stores" s WHERE s."tenantId" = t."tenantId" AND s."code" = 'PRINCIPAL';
UPDATE "suppliers" t SET "storeId" = s."id" FROM "stores" s WHERE s."tenantId" = t."tenantId" AND s."code" = 'PRINCIPAL';
UPDATE "products" t SET "storeId" = s."id" FROM "stores" s WHERE s."tenantId" = t."tenantId" AND s."code" = 'PRINCIPAL';
UPDATE "inventory_movements" t SET "storeId" = s."id" FROM "stores" s WHERE s."tenantId" = t."tenantId" AND s."code" = 'PRINCIPAL';
UPDATE "purchase_orders" t SET "storeId" = s."id" FROM "stores" s WHERE s."tenantId" = t."tenantId" AND s."code" = 'PRINCIPAL';
UPDATE "warranties" t SET "storeId" = s."id" FROM "stores" s WHERE s."tenantId" = t."tenantId" AND s."code" = 'PRINCIPAL';
UPDATE "payments" t SET "storeId" = s."id" FROM "stores" s WHERE s."tenantId" = t."tenantId" AND s."code" = 'PRINCIPAL';
UPDATE "invoices" t SET "storeId" = s."id" FROM "stores" s WHERE s."tenantId" = t."tenantId" AND s."code" = 'PRINCIPAL';
UPDATE "appointments" t SET "storeId" = s."id" FROM "stores" s WHERE s."tenantId" = t."tenantId" AND s."code" = 'PRINCIPAL';
UPDATE "quick_services" t SET "storeId" = s."id" FROM "stores" s WHERE s."tenantId" = t."tenantId" AND s."code" = 'PRINCIPAL';
UPDATE "accessory_options" t SET "storeId" = s."id" FROM "stores" s WHERE s."tenantId" = t."tenantId" AND s."code" = 'PRINCIPAL';

ALTER TABLE "clients" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "motorcycles" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "categories" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "inventory_movements" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "purchase_orders" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "warranties" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "appointments" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "quick_services" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "accessory_options" ALTER COLUMN "storeId" SET NOT NULL;

-- DropIndex (old tenant-only uniques, replaced by tenant+store scoped ones)
DROP INDEX "categories_tenantId_name_key";
DROP INDEX "products_tenantId_sku_key";

-- CreateIndex (new indexes per table)
CREATE INDEX "accessory_options_tenantId_storeId_idx" ON "accessory_options"("tenantId", "storeId");
CREATE INDEX "appointments_tenantId_storeId_idx" ON "appointments"("tenantId", "storeId");
CREATE INDEX "categories_tenantId_storeId_idx" ON "categories"("tenantId", "storeId");
CREATE UNIQUE INDEX "categories_tenantId_storeId_name_key" ON "categories"("tenantId", "storeId", "name");
CREATE INDEX "clients_tenantId_storeId_idx" ON "clients"("tenantId", "storeId");
CREATE INDEX "inventory_movements_tenantId_storeId_idx" ON "inventory_movements"("tenantId", "storeId");
CREATE INDEX "invoices_tenantId_storeId_idx" ON "invoices"("tenantId", "storeId");
CREATE INDEX "motorcycles_tenantId_storeId_idx" ON "motorcycles"("tenantId", "storeId");
CREATE INDEX "orders_tenantId_storeId_idx" ON "orders"("tenantId", "storeId");
CREATE INDEX "payments_tenantId_storeId_idx" ON "payments"("tenantId", "storeId");
CREATE INDEX "products_tenantId_storeId_idx" ON "products"("tenantId", "storeId");
CREATE UNIQUE INDEX "products_tenantId_storeId_sku_key" ON "products"("tenantId", "storeId", "sku");
CREATE INDEX "purchase_orders_tenantId_storeId_idx" ON "purchase_orders"("tenantId", "storeId");
CREATE INDEX "quick_services_tenantId_storeId_idx" ON "quick_services"("tenantId", "storeId");
CREATE INDEX "suppliers_tenantId_storeId_idx" ON "suppliers"("tenantId", "storeId");
CREATE INDEX "warranties_tenantId_storeId_idx" ON "warranties"("tenantId", "storeId");

-- AddForeignKey (storeId -> stores)
ALTER TABLE "clients" ADD CONSTRAINT "clients_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "motorcycles" ADD CONSTRAINT "motorcycles_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quick_services" ADD CONSTRAINT "quick_services_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "accessory_options" ADD CONSTRAINT "accessory_options_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
