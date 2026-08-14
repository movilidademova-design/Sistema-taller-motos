import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client';
import { Role, PosRole, OrderStatus } from '../src/generated/prisma/enums';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * Id fijo para que la semilla sea idempotente, pero con formato de UUID v4
 * VÁLIDO. Antes era '00000000-0000-0000-0000-000000000001', que no pasa el
 * `@IsUUID()` de los DTOs: el dígito de versión debe ser 1-5. Efecto: no se
 * podía crear una orden de compra para el proveedor de demostración, porque la
 * propia API rechazaba su id. Los proveedores reales usan @default(uuid()) y
 * nunca tuvieron el problema.
 */
const SEED_SUPPLIER_ID = '11111111-1111-4111-8111-111111111111';

async function main() {
  const password = 'Password123!';
  const passwordHash = await argon2.hash(password);

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'taller-demo' },
    update: {},
    create: {
      name: 'Taller Demo Bicimotos Eléctricas',
      slug: 'taller-demo',
      address: 'Cra 45 # 12-34, Bogotá',
      phone: '+57 300 555 0100',
      email: 'contacto@tallerdemo.com',
      taxId: '900123456-7',
      taxRatePercent: 19,
      currency: 'COP',
    },
  });

  const [admin, manager, receptionist, technician, cashier, posAdmin] =
    await Promise.all([
      prisma.user.upsert({
        where: { email: 'admin@tallerdemo.com' },
        update: {},
        create: {
          tenantId: tenant.id,
          email: 'admin@tallerdemo.com',
          passwordHash,
          firstName: 'Ana',
          lastName: 'Administradora',
          role: Role.ADMIN,
        },
      }),
      prisma.user.upsert({
        where: { email: 'gerente@tallerdemo.com' },
        update: {},
        create: {
          tenantId: tenant.id,
          email: 'gerente@tallerdemo.com',
          passwordHash,
          firstName: 'Gerardo',
          lastName: 'Gerente',
          role: Role.MANAGER,
        },
      }),
      prisma.user.upsert({
        where: { email: 'recepcion@tallerdemo.com' },
        update: {},
        create: {
          tenantId: tenant.id,
          email: 'recepcion@tallerdemo.com',
          passwordHash,
          firstName: 'Rita',
          lastName: 'Recepción',
          role: Role.RECEPTIONIST,
        },
      }),
      prisma.user.upsert({
        where: { email: 'tecnico@tallerdemo.com' },
        update: {},
        create: {
          tenantId: tenant.id,
          email: 'tecnico@tallerdemo.com',
          passwordHash,
          firstName: 'Tomás',
          lastName: 'Técnico',
          role: Role.TECHNICIAN,
        },
      }),
      prisma.user.upsert({
        where: { email: 'cajero@tallerdemo.com' },
        update: {},
        create: {
          tenantId: tenant.id,
          email: 'cajero@tallerdemo.com',
          passwordHash,
          // Sin rol de taller a propósito: sirve para comprobar que un usuario
          // solo-POS no ve ni una orden y entra directo al POS sin selector.
          role: null,
          posRole: PosRole.CASHIER,
          firstName: 'Carlos',
          lastName: 'Cajero',
        },
      }),
      prisma.user.upsert({
        where: { email: 'pos-admin@tallerdemo.com' },
        update: {},
        create: {
          tenantId: tenant.id,
          email: 'pos-admin@tallerdemo.com',
          passwordHash,
          // Igual que el cajero: sin rol de taller, para poder probar el
          // aislamiento entre sistemas también del lado ADMIN del POS (los
          // reportes y el cierre mensual son PosRole.ADMIN, y sin este
          // usuario no había ninguna cuenta de demo capaz de alcanzarlos).
          role: null,
          posRole: PosRole.ADMIN,
          firstName: 'Patricia',
          lastName: 'Administradora POS',
        },
      }),
    ]);

  const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: '0001' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Principal',
      code: '0001',
      address: tenant.address,
      phone: tenant.phone,
      email: tenant.email,
    },
  });

  // El cajero no es admin de POS, así que necesita una sucursal asignada para
  // poder operar la caja (misma restricción que impone UsersService.create).
  await prisma.userBranch.upsert({
    where: { userId_branchId: { userId: cashier.id, branchId: branch.id } },
    update: {},
    create: { userId: cashier.id, branchId: branch.id },
  });
  await prisma.userBranch.upsert({
    where: { userId_branchId: { userId: posAdmin.id, branchId: branch.id } },
    update: {},
    create: { userId: posAdmin.id, branchId: branch.id },
  });

  const client = await prisma.client.upsert({
    where: {
      tenantId_documentId: { tenantId: tenant.id, documentId: '1020304050' },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      branchId: branch.id,
      firstName: 'Carlos',
      lastName: 'Ramírez',
      documentId: '1020304050',
      phone: '+57 310 555 0199',
      email: 'carlos.ramirez@example.com',
      address: 'Calle 80 # 20-15, Bogotá',
    },
  });

  const motorcycle =
    (await prisma.motorcycle.findFirst({
      where: { tenantId: tenant.id, serialNumber: 'SN-0001' },
    })) ??
    (await prisma.motorcycle.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        clientId: client.id,
        brand: 'Volt',
        model: 'Urban Rider X1',
        color: 'Negro mate',
        year: 2024,
        serialNumber: 'SN-0001',
        motorNumber: 'MTR-0001',
        batteryNumber: 'BAT-0001',
        batteryCapacity: '20Ah',
        voltage: '48V',
        controller: 'Sine Wave 500W',
        display: 'LCD Color',
        mileage: 1200,
      },
    }));

  const category = await prisma.category.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Baterías' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Baterías' },
  });

  const supplier = await prisma.supplier.upsert({
    where: { id: SEED_SUPPLIER_ID },
    update: {},
    create: {
      id: SEED_SUPPLIER_ID,
      tenantId: tenant.id,
      name: 'ElectroPartes S.A.S.',
      contactName: 'Laura Gómez',
      phone: '+57 601 555 0200',
      email: 'ventas@electropartes.com',
    },
  });

  const product = await prisma.product.upsert({
    where: { tenantId_sku: { tenantId: tenant.id, sku: 'BAT-48V-20AH' } },
    update: {},
    create: {
      tenantId: tenant.id,
      categoryId: category.id,
      supplierId: supplier.id,
      sku: 'BAT-48V-20AH',
      code: 'BAT001',
      name: 'Batería de Litio 48V 20Ah',
      unitCost: 450000,
      unitPrice: 650000,
      quantity: 8,
      minStock: 2,
      location: 'Estante A1',
    },
  });

  const existingOrder = await prisma.order.findFirst({
    where: { tenantId: tenant.id },
  });
  if (!existingOrder) {
    // Mirrors OrdersService.nextOrderNumber (apps/api/src/orders/orders.service.ts) —
    // keep this formula in sync if that logic ever changes.
    const branchForOrder = await prisma.branch.update({
      where: { id: branch.id },
      data: { nextOrderNumber: { increment: 1 } },
    });
    const sequence = String(branchForOrder.nextOrderNumber - 1).padStart(
      4,
      '0',
    );
    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        orderNumber: `${branchForOrder.code}${sequence}`,
        clientId: client.id,
        motorcycleId: motorcycle.id,
        receptionistId: receptionist.id,
        technicianId: technician.id,
        reason: 'La bicimoto no enciende y la batería no carga',
        status: OrderStatus.DIAGNOSING,
      },
    });

    await prisma.orderStatusHistory.createMany({
      data: [
        {
          orderId: order.id,
          toStatus: OrderStatus.RECEIVED,
          changedById: receptionist.id,
          notes: 'Orden creada',
        },
        {
          orderId: order.id,
          fromStatus: OrderStatus.RECEIVED,
          toStatus: OrderStatus.DIAGNOSING,
          changedById: technician.id,
          notes: 'Técnico asignado, iniciando diagnóstico',
        },
      ],
    });

    console.log(`Orden demo creada: #${order.orderNumber}`);
  }

  console.log('\nSeed completado.');
  console.log(`Taller: ${tenant.name} (${tenant.slug})`);
  console.log('Usuarios de prueba (misma contraseña para todos):');
  console.log(`  Admin:        ${admin.email} / ${password}`);
  console.log(`  Gerente:      ${manager.email} / ${password}`);
  console.log(`  Recepción:    ${receptionist.email} / ${password}`);
  console.log(`  Técnico:      ${technician.email} / ${password}`);
  console.log(`  Cajero (POS): ${cashier.email} / ${password}`);
  console.log(`  Admin POS: ${posAdmin.email} / ${password}`);
  console.log(`Producto demo: ${product.name} (stock ${product.quantity})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
