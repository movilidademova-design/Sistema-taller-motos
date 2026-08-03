import { OrdersService, orderSearchFilter } from './orders.service';
import { MAX_ROWS } from '../common/excel/excel.service';
import {
  findManyArgs,
  stubExcel,
  stubPrisma,
  whereOf,
} from '../common/testing/export-test-utils';
import { Role } from '../generated/prisma/enums';
import type { ExportOrdersQueryDto } from './dto/export-orders-query.dto';

function makeService(overrides: {
  findMany: jest.Mock;
  generate?: jest.Mock;
}): OrdersService {
  return new OrdersService(
    stubPrisma('order', overrides.findMany),
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    stubExcel(overrides.generate),
  );
}

describe('OrdersService.exportToExcel', () => {
  const tenantId = 'tenant-1';
  const currentBranch = 'branch-actual';
  const otherBranch = 'branch-ajeno';

  function run(role: Role, query: ExportOrdersQueryDto = {}) {
    const findMany = jest.fn().mockResolvedValue([]);
    const generate = jest.fn().mockResolvedValue(Buffer.from(''));
    const service = makeService({ findMany, generate });
    return {
      findMany,
      generate,
      promise: service.exportToExcel(tenantId, currentBranch, role, query),
    };
  }

  it('always scopes to the tenant', async () => {
    const { findMany, promise } = run(Role.ADMIN);
    await promise;
    expect(whereOf(findMany).tenantId).toBe(tenantId);
  });

  it('caps the query one row above the limit so an oversized export fails fast', async () => {
    const { findMany, promise } = run(Role.ADMIN);
    await promise;
    expect(findManyArgs(findMany).take).toBe(MAX_ROWS + 1);
  });

  it('pins a MANAGER to their own branch, ignoring a requested one', async () => {
    const { findMany, promise } = run(Role.MANAGER, { branchId: otherBranch });
    await promise;
    expect(whereOf(findMany).branchId).toBe(currentBranch);
  });

  it('exports every branch for an ADMIN who picked none', async () => {
    const { findMany, promise } = run(Role.ADMIN);
    await promise;
    expect(whereOf(findMany)).not.toHaveProperty('branchId');
  });

  it('filters by reception date over the requested range', async () => {
    const { findMany, promise } = run(Role.ADMIN, {
      from: '2026-07-01',
      to: '2026-07-31',
    });
    await promise;
    expect(whereOf(findMany).receivedAt).toEqual({
      gte: new Date('2026-07-01T05:00:00.000Z'),
      lt: new Date('2026-08-01T05:00:00.000Z'),
    });
  });

  it('omits the date filter entirely when no range was given', async () => {
    const { findMany, promise } = run(Role.ADMIN);
    await promise;
    expect(whereOf(findMany)).not.toHaveProperty('receivedAt');
  });

  it('searches the same fields the on-screen list searches', async () => {
    // Si el export mirara otros campos que `findAll`, exportar devolvería filas
    // distintas de las que el usuario acaba de ver, sin ningún aviso. Es el bug
    // que esta comprobación existe para que no vuelva.
    const { findMany, promise } = run(Role.ADMIN, { search: 'abc' });
    await promise;
    expect(whereOf(findMany).OR).toEqual(orderSearchFilter('abc')!.OR);
  });

  it('builds the same search clause the on-screen list builds', async () => {
    // La otra mitad de la paridad: sin esto, alguien podría volver a poner un
    // OR propio dentro de `findAll` y el test de arriba seguiría en verde,
    // porque solo mira el lado del export.
    const listFindMany = jest.fn().mockResolvedValue([]);
    const $transaction = jest.fn().mockResolvedValue([[], 0]);
    const service = new OrdersService(
      {
        order: { findMany: listFindMany, count: jest.fn() },
        $transaction,
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.findAll(tenantId, { search: 'abc' });

    expect(whereOf(listFindMany).OR).toEqual(orderSearchFilter('abc')!.OR);
  });

  it('hands the rows to ExcelService under a Spanish sheet name', async () => {
    const { generate, promise } = run(Role.ADMIN);
    await promise;
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ sheetName: 'Órdenes' }),
    );
  });
});

describe('orderSearchFilter', () => {
  it('returns undefined without a search term, so the caller adds no filter', () => {
    expect(orderSearchFilter(undefined)).toBeUndefined();
    expect(orderSearchFilter('')).toBeUndefined();
  });

  it('covers order number, reason, client name and vehicle serial', () => {
    const filter = orderSearchFilter('xyz');
    expect(filter!.OR).toHaveLength(5);
    expect(JSON.stringify(filter)).toContain('orderNumber');
    expect(JSON.stringify(filter)).toContain('serialNumber');
  });

  it('matches case-insensitively', () => {
    const filter = orderSearchFilter('xyz');
    for (const clause of filter!.OR) {
      expect(JSON.stringify(clause)).toContain('"mode":"insensitive"');
    }
  });
});
