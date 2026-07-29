// apps/api/prisma/backfill-catalog-branches.ts
// One-off data migration: assigns every existing QuickService and AccessoryOption
// row to the tenant's original default branch (created in Sucursales Fase 1's own
// backfill, or in registerTenant for tenants created since). New branches start
// with an empty catalog — each sucursal is expected to build its own list.
//
// The default branch is identified as the tenant's EARLIEST-created branch, not by
// code "0001" — a branch's code and name are user-editable (Settings → Sucursales),
// and in practice get renamed to the shop's real identity once someone starts using
// it, so code alone isn't a stable way to find "the one that used to be Principal".
// Creation order is: both Fase 1's own backfill and registerTenant create exactly
// one branch per tenant before any other branch can exist, so the oldest branch is
// always that one, regardless of what it's since been renamed/recoded to.
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

    const defaultBranch = await prisma.branch.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'asc' },
    });
    if (!defaultBranch) {
      console.log(
        `Tenant ${tenant.name} has no branches at all — skipping. ` +
          `Run this after Sucursales Fase 1's own backfill has created one.`,
      );
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const { count: quickServiceCount } = await tx.quickService.updateMany({
        where: { tenantId: tenant.id, branchId: null },
        data: { branchId: defaultBranch.id },
      });
      const { count: accessoryOptionCount } = await tx.accessoryOption.updateMany({
        where: { tenantId: tenant.id, branchId: null },
        data: { branchId: defaultBranch.id },
      });
      console.log(
        `  Backfilled branchId: ${quickServiceCount} quick services, ${accessoryOptionCount} accessory options ` +
          `(→ "${defaultBranch.name}", code ${defaultBranch.code})`,
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
