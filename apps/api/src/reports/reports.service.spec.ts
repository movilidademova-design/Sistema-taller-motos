import { ReportsService } from './reports.service';
import { stubExcel, whereOf } from '../common/testing/export-test-utils';
import { RevenueGroupBy } from './dto/revenue-report-query.dto';
import { Role } from '../generated/prisma/enums';
import type { RevenueReportQueryDto } from './dto/revenue-report-query.dto';

/**
 * A diferencia de los demás exports, `exportRevenue` dispara dos `findMany`
 * (facturas y órdenes entregadas) dentro de un `Promise.all`, así que
 * `stubPrisma` (pensado para un solo modelo) no sirve aquí: se arma un stub a
 * mano con ambos modelos.
 */
function makeService(overrides: {
  invoiceFindMany?: jest.Mock;
  orderFindMany?: jest.Mock;
  generate?: jest.Mock;
}) {
  const invoiceFindMany =
    overrides.invoiceFindMany ?? jest.fn().mockResolvedValue([]);
  const orderFindMany =
    overrides.orderFindMany ?? jest.fn().mockResolvedValue([]);
  const generate = overrides.generate;
  const prisma = {
    invoice: { findMany: invoiceFindMany },
    order: { findMany: orderFindMany },
  } as never;
  const service = new ReportsService(prisma, stubExcel(generate));
  return { service, invoiceFindMany, orderFindMany };
}

function invoice(
  issuedAt: string,
  total: number,
  amountPaid: number,
  branchName: string,
) {
  return {
    issuedAt: new Date(issuedAt),
    total,
    amountPaid,
    order: { branch: { name: branchName } },
  };
}

function deliveredOrder(deliveredAt: string, branchName: string) {
  return { deliveredAt: new Date(deliveredAt), branch: { name: branchName } };
}

function run(
  role: Role,
  query: RevenueReportQueryDto = {},
  data: { invoices?: unknown[]; orders?: unknown[] } = {},
) {
  const invoiceFindMany = jest.fn().mockResolvedValue(data.invoices ?? []);
  const orderFindMany = jest.fn().mockResolvedValue(data.orders ?? []);
  const generate = jest.fn().mockResolvedValue(Buffer.from(''));
  const { service } = makeService({ invoiceFindMany, orderFindMany, generate });
  const promise = service.exportRevenue(
    'tenant-1',
    'branch-actual',
    role,
    query,
  );
  return { invoiceFindMany, orderFindMany, generate, promise };
}

/** Argumento con el que `ExcelService.generate` fue invocado. */
function generateArgs(generate: jest.Mock) {
  expect(generate).toHaveBeenCalled();
  const [args] = generate.mock.calls[0] as [
    {
      sheetName: string;
      rows: unknown[];
      columns: { header: string; value: (row: unknown) => unknown }[];
    },
  ];
  return args;
}

/** Valor de una columna, tal como lo calcularía ExcelJS, para una fila dada. */
function columnValue(
  args: ReturnType<typeof generateArgs>,
  header: string,
  row: unknown,
) {
  const column = args.columns.find((c) => c.header === header);
  if (!column) throw new Error(`No column with header "${header}"`);
  return column.value(row);
}

describe('ReportsService.exportRevenue', () => {
  it('aggregates invoices and delivered orders into (period, branch) buckets', async () => {
    const invoices = [
      invoice('2026-06-05T12:00:00.000Z', 100, 100, 'Norte'),
      invoice('2026-06-20T12:00:00.000Z', 50, 20, 'Norte'),
      invoice('2026-07-01T12:00:00.000Z', 200, 200, 'Sur'),
    ];
    const orders = [
      deliveredOrder('2026-06-10T12:00:00.000Z', 'Norte'),
      deliveredOrder('2026-06-15T12:00:00.000Z', 'Norte'),
      deliveredOrder('2026-07-02T12:00:00.000Z', 'Sur'),
    ];
    const { generate, promise } = run(Role.ADMIN, {}, { invoices, orders });
    await promise;
    const args = generateArgs(generate);

    expect(args.rows).toEqual([
      {
        period: '2026-06',
        branchName: 'Norte',
        deliveredOrders: 2,
        invoiceCount: 2,
        invoiced: 150,
        collected: 120,
      },
      {
        period: '2026-07',
        branchName: 'Sur',
        deliveredOrders: 1,
        invoiceCount: 1,
        invoiced: 200,
        collected: 200,
      },
    ]);
  });

  it('rounds money columns to cents, absorbing float drift', async () => {
    const invoices = [
      invoice('2026-06-01T00:00:00.000Z', 0.1, 0.1, 'Norte'),
      invoice('2026-06-02T00:00:00.000Z', 0.2, 0.2, 'Norte'),
    ];
    const { generate, promise } = run(Role.ADMIN, {}, { invoices });
    await promise;
    const args = generateArgs(generate);

    // La suma cruda en punto flotante ya arrastra el error de 0.1 + 0.2.
    const row = args.rows[0] as { invoiced: number };
    expect(row.invoiced).not.toBe(0.3);

    expect(columnValue(args, 'Total facturado', row)).toBe(0.3);
    expect(columnValue(args, 'Total cobrado', row)).toBe(0.3);
    expect(columnValue(args, 'Saldo pendiente', row)).toBe(0);
  });

  it('defaults groupBy to MONTH when omitted', async () => {
    const invoices = [
      invoice('2026-06-01T00:00:00.000Z', 10, 10, 'Norte'),
      invoice('2026-06-15T00:00:00.000Z', 10, 10, 'Norte'),
    ];
    const { generate, promise } = run(Role.ADMIN, {}, { invoices });
    await promise;
    const args = generateArgs(generate);
    expect(args.rows).toHaveLength(1);
    expect((args.rows[0] as { period: string }).period).toBe('2026-06');
  });

  it('produces per-day buckets when groupBy is DAY', async () => {
    const invoices = [
      invoice('2026-06-01T00:00:00.000Z', 10, 10, 'Norte'),
      invoice('2026-06-15T00:00:00.000Z', 10, 10, 'Norte'),
    ];
    const { generate, promise } = run(
      Role.ADMIN,
      { groupBy: RevenueGroupBy.DAY },
      { invoices },
    );
    await promise;
    const args = generateArgs(generate);
    expect(args.rows).toHaveLength(2);
    expect((args.rows as { period: string }[]).map((r) => r.period)).toEqual([
      '2026-06-01',
      '2026-06-15',
    ]);
  });

  it('pins a MANAGER to their own branch on both queries', async () => {
    const { invoiceFindMany, orderFindMany, promise } = run(Role.MANAGER, {
      branchId: 'branch-ajeno',
    });
    await promise;
    const invoiceWhere = whereOf(invoiceFindMany);
    const orderWhere = whereOf(orderFindMany);
    expect(invoiceWhere.order).toEqual({ branchId: 'branch-actual' });
    expect(orderWhere.branchId).toBe('branch-actual');
  });

  it('leaves both queries unfiltered by branch for an ADMIN who picked none', async () => {
    const { invoiceFindMany, orderFindMany, promise } = run(Role.ADMIN);
    await promise;
    const invoiceWhere = whereOf(invoiceFindMany);
    const orderWhere = whereOf(orderFindMany);
    expect(invoiceWhere).not.toHaveProperty('order');
    expect(orderWhere).not.toHaveProperty('branchId');
  });

  it('sorts rows by period, then by branch name', async () => {
    const invoices = [
      invoice('2026-07-01T00:00:00.000Z', 10, 10, 'Sur'),
      invoice('2026-06-01T00:00:00.000Z', 10, 10, 'Sur'),
      invoice('2026-06-01T00:00:00.000Z', 10, 10, 'Norte'),
    ];
    const { generate, promise } = run(Role.ADMIN, {}, { invoices });
    await promise;
    const args = generateArgs(generate);
    expect(
      (args.rows as { period: string; branchName: string }[]).map(
        (r) => `${r.period}|${r.branchName}`,
      ),
    ).toEqual(['2026-06|Norte', '2026-06|Sur', '2026-07|Sur']);
  });

  it('uses the Spanish sheet name "Ingresos"', async () => {
    const { generate, promise } = run(Role.ADMIN);
    await promise;
    expect(generateArgs(generate).sheetName).toBe('Ingresos');
  });
});
