// apps/api/prisma/backfill-branches.ts
// One-off data migration: creates a "Principal" branch per tenant and backfills
// branchId on all existing Client/Motorcycle/Order rows. Also computes each new
// Branch's nextOrderNumber so future orders continue the old numeric sequence
// without colliding with the values this script assigns below.
//
// Run once, after the nullable-branchId migration (Task 2) and before the
// not-null migration (Task 4): `pnpm --filter @taller/api exec tsx prisma/backfill-branches.ts`

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const tenants = await prisma.tenant.findMany();

  for (const tenant of tenants) {
    // Keyed on the actual postcondition (every order already has both a
    // branchId and a reformatted orderNumberText), not just "a branch exists
    // for this tenant" — a tenant could have a branch row from a prior run
    // that crashed partway through, and re-running must still finish the job
    // rather than silently skip it.
    const unbackfilledOrders = await prisma.order.count({
      where: {
        tenantId: tenant.id,
        OR: [{ branchId: null }, { orderNumberText: null }],
      },
    });
    const unbackfilledClients = await prisma.client.count({
      where: { tenantId: tenant.id, branchId: null },
    });
    const unbackfilledMotorcycles = await prisma.motorcycle.count({
      where: { tenantId: tenant.id, branchId: null },
    });
    if (
      unbackfilledOrders === 0 &&
      unbackfilledClients === 0 &&
      unbackfilledMotorcycles === 0
    ) {
      console.log(`Tenant ${tenant.name} is already fully backfilled, skipping.`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const branch =
        (await tx.branch.findFirst({ where: { tenantId: tenant.id } })) ??
        (await (async () => {
          const orders = await tx.order.findMany({
            where: { tenantId: tenant.id },
            select: { orderNumber: true },
          });
          const maxOrderNumber = orders.reduce(
            (max, o) => Math.max(max, Number(o.orderNumber)),
            0,
          );
          const created = await tx.branch.create({
            data: {
              tenantId: tenant.id,
              name: 'Principal',
              code: '0001',
              address: tenant.address,
              phone: tenant.phone,
              email: tenant.email,
              nextOrderNumber: maxOrderNumber + 1,
            },
          });
          console.log(`Created branch "Principal" (0001) for tenant ${tenant.name}`);
          return created;
        })());

      const { count: clientCount } = await tx.client.updateMany({
        where: { tenantId: tenant.id, branchId: null },
        data: { branchId: branch.id },
      });
      const { count: motorcycleCount } = await tx.motorcycle.updateMany({
        where: { tenantId: tenant.id, branchId: null },
        data: { branchId: branch.id },
      });
      const { count: orderCount } = await tx.order.updateMany({
        where: { tenantId: tenant.id, branchId: null },
        data: { branchId: branch.id },
      });
      console.log(
        `  Backfilled branchId: ${clientCount} clients, ${motorcycleCount} motorcycles, ${orderCount} orders`,
      );

      // Reformat existing order numbers into the new "<code><4-digit sequence>" scheme.
      const allOrders = await tx.order.findMany({
        where: { tenantId: tenant.id, orderNumberText: null },
        select: { id: true, orderNumber: true },
      });
      for (const order of allOrders) {
        const sequence = String(order.orderNumber).padStart(4, '0');
        await tx.order.update({
          where: { id: order.id },
          data: { orderNumberText: `${branch.code}${sequence}` },
        });
      }
      console.log(`  Reformatted ${allOrders.length} order numbers`);
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
