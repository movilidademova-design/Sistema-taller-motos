/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { ClientsService, clientSearchFilter } from './clients.service';
import { MAX_ROWS } from '../common/excel/excel.service';
import { findManyArgs, whereOf } from '../common/testing/export-test-utils';
import type { ExportQueryDto } from '../common/dto/export-query.dto';

function makeService(overrides: {
  findMany: jest.Mock;
  generate?: jest.Mock;
}): ClientsService {
  return new ClientsService(
    { client: { findMany: overrides.findMany } } as never,
    { generate: overrides.generate ?? jest.fn() } as never,
  );
}

describe('ClientsService.exportToExcel', () => {
  const tenantId = 'tenant-1';

  function run(query: Partial<ExportQueryDto> = {}) {
    const findMany = jest.fn().mockResolvedValue([]);
    const generate = jest.fn().mockResolvedValue(Buffer.from(''));
    const service = makeService({ findMany, generate });
    return {
      findMany,
      generate,
      promise: service.exportToExcel(tenantId, query as ExportQueryDto),
    };
  }

  it('always scopes to the tenant', async () => {
    const { findMany, promise } = run();
    await promise;
    expect(whereOf(findMany).tenantId).toBe(tenantId);
  });

  it('caps the query one row above the limit so an oversized export fails fast', async () => {
    const { findMany, promise } = run();
    await promise;
    expect(findManyArgs(findMany).take).toBe(MAX_ROWS + 1);
  });

  it('filters by registration date over the requested range', async () => {
    const { findMany, promise } = run({
      from: '2026-07-01',
      to: '2026-07-31',
    });
    await promise;
    expect(whereOf(findMany).createdAt).toEqual({
      gte: new Date('2026-07-01T05:00:00.000Z'),
      lt: new Date('2026-08-01T05:00:00.000Z'),
    });
  });

  it('omits the date filter entirely when no range was given', async () => {
    const { findMany, promise } = run();
    await promise;
    expect(whereOf(findMany)).not.toHaveProperty('createdAt');
  });

  it('searches the same fields the on-screen list searches', async () => {
    // Si el export mirara otros campos que `findAll`, exportar devolvería filas
    // distintas de las que el usuario acaba de ver, sin ningún aviso. Es el bug
    // que esta comprobación existe para que no vuelva.
    const { findMany, promise } = run({ search: 'abc' });
    await promise;
    expect(whereOf(findMany).OR).toEqual(clientSearchFilter('abc')!.OR);
  });

  it('builds the same search clause the on-screen list builds', async () => {
    // La otra mitad de la paridad: sin esto, alguien podría volver a poner un
    // OR propio dentro de `findAll` y el test de arriba seguiría en verde,
    // porque solo mira el lado del export.
    const listFindMany = jest.fn().mockResolvedValue([]);
    const $transaction = jest.fn().mockResolvedValue([[], 0]);
    const service = new ClientsService(
      { client: { findMany: listFindMany, count: jest.fn() }, $transaction } as never,
      {} as never,
    );

    await service.findAll(tenantId, { search: 'abc' });

    const listWhere = $transaction.mock.calls[0][0];
    expect(listWhere).toHaveLength(2);
    expect(listFindMany.mock.calls[0][0].where.OR).toEqual(
      clientSearchFilter('abc')!.OR,
    );
  });

  it('does not filter isActive — the export covers the full history, active or not', async () => {
    const { findMany, promise } = run();
    await promise;
    expect(whereOf(findMany)).not.toHaveProperty('isActive');
  });

  it("findAll DOES filter isActive, unlike the export", async () => {
    const listFindMany = jest.fn().mockResolvedValue([]);
    const $transaction = jest.fn().mockResolvedValue([[], 0]);
    const service = new ClientsService(
      { client: { findMany: listFindMany, count: jest.fn() }, $transaction } as never,
      {} as never,
    );

    await service.findAll(tenantId, {});

    expect(listFindMany.mock.calls[0][0].where.isActive).toBe(true);
  });

  it('hands the rows to ExcelService under a Spanish sheet name', async () => {
    const { generate, promise } = run();
    await promise;
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ sheetName: 'Clientes' }),
    );
  });
});

describe('clientSearchFilter', () => {
  it('returns undefined without a search term, so the caller adds no filter', () => {
    expect(clientSearchFilter(undefined)).toBeUndefined();
    expect(clientSearchFilter('')).toBeUndefined();
  });

  it('covers name, document, phone and email', () => {
    const filter = clientSearchFilter('xyz');
    expect(filter!.OR).toHaveLength(5);
    expect(JSON.stringify(filter)).toContain('documentId');
    expect(JSON.stringify(filter)).toContain('email');
  });

  it('matches case-insensitively', () => {
    const filter = clientSearchFilter('xyz');
    for (const clause of filter!.OR) {
      expect(JSON.stringify(clause)).toContain('"mode":"insensitive"');
    }
  });
});
