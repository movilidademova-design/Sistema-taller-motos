-- CreateTable
CREATE TABLE "accessory_options" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accessory_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accessory_options_tenantId_idx" ON "accessory_options"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "accessory_options_tenantId_label_key" ON "accessory_options"("tenantId", "label");

-- AddForeignKey
ALTER TABLE "accessory_options" ADD CONSTRAINT "accessory_options_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
