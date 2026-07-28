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
    const existingBranch = await prisma.branch.findFirst({
      where: { tenantId: tenant.id },
    });
    if (existingBranch) {
      console.log(`Tenant ${tenant.name} already has a branch, skipping.`);
      continue;
    }

    const orders = await prisma.order.findMany({
      where: { tenantId: tenant.id },
      select: { orderNumber: true },
    });
    const maxOrderNumber = orders.reduce(
      (max, o) => Math.max(max, Number(o.orderNumber)),
      0,
    );

    const branch = await prisma.branch.create({
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

    const { count: clientCount } = await prisma.client.updateMany({
      where: { tenantId: tenant.id },
      data: { branchId: branch.id },
    });
    const { count: motorcycleCount } = await prisma.motorcycle.updateMany({
      where: { tenantId: tenant.id },
      data: { branchId: branch.id },
    });
    const { count: orderCount } = await prisma.order.updateMany({
      where: { tenantId: tenant.id },
      data: { branchId: branch.id },
    });
    console.log(
      `  Backfilled branchId: ${clientCount} clients, ${motorcycleCount} motorcycles, ${orderCount} orders`,
    );

    // Reformat existing order numbers into the new "<code><4-digit sequence>" scheme.
    const allOrders = await prisma.order.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, orderNumber: true },
    });
    for (const order of allOrders) {
      const sequence = String(order.orderNumber).padStart(4, '0');
      await prisma.order.update({
        where: { id: order.id },
        data: { orderNumberText: `${branch.code}${sequence}` },
      });
    }
    console.log(`  Reformatted ${allOrders.length} order numbers`);
  }

  console.log('Done.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
