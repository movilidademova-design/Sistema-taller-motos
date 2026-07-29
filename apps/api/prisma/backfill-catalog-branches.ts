// apps/api/prisma/backfill-catalog-branches.ts
// One-off data migration: assigns every existing QuickService and AccessoryOption
// row to the tenant's "Principal" branch (created in Sucursales Fase 1's own
// backfill, or in registerTenant for tenants created since). New branches start
// with an empty catalog — each sucursal is expected to build its own list.
//
// Run once, after the nullable-branchId migration (Task 1) and before the
// not-null migration (Task 3): `pnpm --filter @taller/api exec tsx prisma/backfill-catalog-branches.ts`

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const tenants = await prisma.tenant.findMany();

  for (const tenant of tenants) {
    const unbackfilledQuickServices = await prisma.quickService.count({
      where: { tenantId: tenant.id, branchId: null },
    });
    const unbackfilledAccessoryOptions = await prisma.accessoryOption.count({
      where: { tenantId: tenant.id, branchId: null },
    });
    if (unbackfilledQuickServices === 0 && unbackfilledAccessoryOptions === 0) {
      console.log(`Tenant ${tenant.name} already fully backfilled, skipping.`);
      continue;
    }

    const principal = await prisma.branch.findFirst({
      where: { tenantId: tenant.id, code: '0001' },
    });
    if (!principal) {
      console.log(
        `Tenant ${tenant.name} has no "Principal" (code 0001) branch — skipping. ` +
          `Run this after Sucursales Fase 1's own backfill has created one.`,
      );
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const { count: quickServiceCount } = await tx.quickService.updateMany({
        where: { tenantId: tenant.id, branchId: null },
        data: { branchId: principal.id },
      });
      const { count: accessoryOptionCount } = await tx.accessoryOption.updateMany({
        where: { tenantId: tenant.id, branchId: null },
        data: { branchId: principal.id },
      });
      console.log(
        `  Backfilled branchId: ${quickServiceCount} quick services, ${accessoryOptionCount} accessory options`,
      );
    });
  }

  console.log('Done.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
