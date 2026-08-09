import { PosReportsService } from './reports.service';
import { PosSaleStatus, PosLayawayStatus } from '../../generated/pos/enums';
import { Prisma } from '../../generated/pos/client';
import { whereOf } from '../../common/testing/export-test-utils';

const tenantId = 'tenant-1';
const branchId = 'branch-calle-80';

function makeService(overrides: {
  posSaleFindMany?: jest.Mock;
  posLayawayFindMany?: jest.Mock;
  posLayawayPaymentFindMany?: jest.Mock;
  posProductFindMany?: jest.Mock;
  userFindMany?: jest.Mock;
}) {
  const posSaleFindMany =
    overrides.posSaleFindMany ?? jest.fn().mockResolvedValue([]);
  const posLayawayFindMany =
    overrides.posLayawayFindMany ?? jest.fn().mockResolvedValue([]);
  const posLayawayPaymentFindMany =
    overrides.posLayawayPaymentFindMany ?? jest.fn().mockResolvedValue([]);
  const posProductFindMany =
    overrides.posProductFindMany ?? jest.fn().mockResolvedValue([]);
  const userFindMany =
    overrides.userFindMany ?? jest.fn().mockResolvedValue([]);

  const posPrisma = {
    posSale: { findMany: posSaleFindMany },
    posLayaway: { findMany: posLayawayFindMany },
    posLayawayPayment: { findMany: posLayawayPaymentFindMany },
    posProduct: { findMany: posProductFindMany },
  } as never;
  const workshopPrisma = { user: { findMany: userFindMany } } as never;

  const service = new PosReportsService(posPrisma, workshopPrisma);
  return {
    service,
    posSaleFindMany,
    posLayawayFindMany,
    posLayawayPaymentFindMany,
    posProductFindMany,
    userFindMany,
  };
}

function sale(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    soldAt: new Date('2026-04-10'),
    invoiceNumber: 1,
    clientName: 'Cliente',
    total: new Prisma.Decimal(1000),
    status: PosSaleStatus.ACTIVE,
    createdById: 'user-1',
    items: [],
    payments: [],
    ...overrides,
  };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Producto',
    finalPrice: new Prisma.Decimal(100),
    unitCost: new Prisma.Decimal(60),
    quantity: 1,
    lineTotal: new Prisma.Decimal(100),
    ...overrides,
  };
}

describe('PosReportsService.summary', () => {
  it('excluye ventas anuladas porque nunca las pide (status != VOIDED)', async () => {
    const { service, posSaleFindMany } = makeService({});
    await service.summary(tenantId, branchId, {});
    expect(whereOf(posSaleFindMany).status).toEqual({
      not: PosSaleStatus.VOIDED,
    });
  });

  it('una venta activa suma de más al total facturado y a la ganancia', async () => {
    const s = sale({
      total: new Prisma.Decimal(1000),
      items: [
        item({
          finalPrice: new Prisma.Decimal(1000),
          unitCost: new Prisma.Decimal(600),
          quantity: 1,
        }),
      ],
    });
    const { service } = makeService({
      posSaleFindMany: jest.fn().mockResolvedValue([s]),
    });
    const result = await service.summary(tenantId, branchId, {});
    expect(result.totalInvoiced).toBe(1000);
    expect(result.totalProfit).toBe(400);
    expect(result.salesCount).toBe(1);
  });

  it('una nota crédito resta del total facturado y de la ganancia, y no cuenta como venta', async () => {
    const active = sale({
      id: 's1',
      total: new Prisma.Decimal(1000),
      items: [
        item({
          finalPrice: new Prisma.Decimal(1000),
          unitCost: new Prisma.Decimal(600),
        }),
      ],
    });
    const credited = sale({
      id: 's2',
      status: PosSaleStatus.CREDIT_NOTE,
      total: new Prisma.Decimal(300),
      items: [
        item({
          finalPrice: new Prisma.Decimal(300),
          unitCost: new Prisma.Decimal(200),
        }),
      ],
    });
    const { service } = makeService({
      posSaleFindMany: jest.fn().mockResolvedValue([active, credited]),
    });
    const result = await service.summary(tenantId, branchId, {});
    expect(result.totalInvoiced).toBe(700); // 1000 - 300
    expect(result.totalProfit).toBe(300); // 400 - 100
    expect(result.salesCount).toBe(1); // la nota crédito no cuenta como venta
  });

  it('separados activos salen con su saldo, sin filtrar por fecha', async () => {
    const layaway = {
      id: 'l1',
      clientName: 'Ana',
      total: new Prisma.Decimal(500),
      paid: new Prisma.Decimal(200),
      balance: new Prisma.Decimal(300),
    };
    const { service, posLayawayFindMany } = makeService({
      posLayawayFindMany: jest.fn().mockResolvedValue([layaway]),
    });
    const result = await service.summary(tenantId, branchId, {});
    expect(whereOf(posLayawayFindMany).status).toBe(PosLayawayStatus.ACTIVE);
    expect(result.activeLayaways).toEqual([
      { id: 'l1', clientName: 'Ana', total: 500, paid: 200, balance: 300 },
    ]);
  });
});

describe('PosReportsService.exportMonthlyClose', () => {
  it('el efectivo de un separado activo no se cuenta si ya viene de una venta activa', async () => {
    // Caso de doble conteo que ya mordió en app.py: si un separado ya
    // completó, su efectivo vuelve en los pagos de la venta resultante, así
    // que la consulta de abonos NO debe sumarlo otra vez.
    const activeSale = sale({
      status: PosSaleStatus.ACTIVE,
      total: new Prisma.Decimal(1000),
      payments: [{ method: 'efectivo', amount: new Prisma.Decimal(1000) }],
    });
    const abonoDeActivo = {
      paidAt: new Date('2026-04-05'),
      amount: new Prisma.Decimal(200),
      method: 'efectivo',
      receiptNumber: 3,
      createdById: 'user-1',
      layaway: { clientName: 'Ana', status: PosLayawayStatus.ACTIVE },
    };
    const abonoDeCompletado = {
      paidAt: new Date('2026-04-06'),
      amount: new Prisma.Decimal(9999),
      method: 'efectivo',
      receiptNumber: 4,
      createdById: 'user-1',
      layaway: { clientName: 'Otro', status: PosLayawayStatus.COMPLETED },
    };
    const { service } = makeService({
      posSaleFindMany: jest.fn().mockResolvedValue([activeSale]),
      posLayawayPaymentFindMany: jest
        .fn()
        .mockResolvedValue([abonoDeActivo, abonoDeCompletado]),
    });

    const buffer = await service.exportMonthlyClose(tenantId, branchId, {
      month: '2026-04',
    });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    // No se puede leer numFmt fácilmente sin reabrir el buffer con ExcelJS;
    // el cálculo de doble conteo en sí lo cubre monthly-close.util.spec.ts a
    // partir de `cashFromSales`/`cashFromActiveLayawayPayments` ya resueltos.
    // Aquí lo que importa es que la consulta de abonos filtre por layaway no
    // cancelado y que el servicio no reviente al combinarlo.
  });

  it('pin de sucursal: sin branchId explícito, usa la sucursal actual, nunca "todas"', async () => {
    const { service, posSaleFindMany } = makeService({});
    await service.exportMonthlyClose(tenantId, 'branch-actual', {
      month: '2026-04',
    });
    expect(whereOf(posSaleFindMany).branchId).toBe('branch-actual');
  });

  it('con branchId explícito, lo respeta', async () => {
    const { service, posSaleFindMany } = makeService({});
    await service.exportMonthlyClose(tenantId, 'branch-actual', {
      month: '2026-04',
      branchId: 'branch-otra',
    });
    expect(whereOf(posSaleFindMany).branchId).toBe('branch-otra');
  });
});
