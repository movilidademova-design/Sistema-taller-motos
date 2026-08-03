import { InvoicesService } from './invoices.service';
import { MAX_ROWS } from '../common/excel/excel.service';
import {
  findManyArgs,
  stubExcel,
  stubPrisma,
  whereOf,
} from '../common/testing/export-test-utils';
import { InvoiceStatus, Role } from '../generated/prisma/enums';
import type { ExportInvoicesQueryDto } from './dto/export-invoices-query.dto';

function makeService(overrides: {
  findMany: jest.Mock;
  generate?: jest.Mock;
}): InvoicesService {
  return new InvoicesService(
    stubPrisma('invoice', overrides.findMany),
    {} as never,
    {} as never,
    stubExcel(overrides.generate),
  );
}

describe('InvoicesService.exportToExcel', () => {
  const tenantId = 'tenant-1';
  const currentBranch = 'branch-actual';
  const otherBranch = 'branch-ajeno';

  function run(role: Role, query: ExportInvoicesQueryDto = {}) {
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
    expect(whereOf(findMany).order).toEqual({ branchId: currentBranch });
  });

  it('exports every branch for an ADMIN who picked none, with no order clause at all', async () => {
    const { findMany, promise } = run(Role.ADMIN);
    await promise;
    expect(whereOf(findMany)).not.toHaveProperty('order');
  });

  it('filters by issue date over the requested range', async () => {
    const { findMany, promise } = run(Role.ADMIN, {
      from: '2026-07-01',
      to: '2026-07-31',
    });
    await promise;
    expect(whereOf(findMany).issuedAt).toEqual({
      gte: new Date('2026-07-01T05:00:00.000Z'),
      lt: new Date('2026-08-01T05:00:00.000Z'),
    });
  });

  it('omits the date filter entirely when no range was given', async () => {
    const { findMany, promise } = run(Role.ADMIN);
    await promise;
    expect(whereOf(findMany)).not.toHaveProperty('issuedAt');
  });

  it('filters by status when given', async () => {
    const { findMany, promise } = run(Role.ADMIN, {
      status: InvoiceStatus.PAID,
    });
    await promise;
    expect(whereOf(findMany).status).toBe(InvoiceStatus.PAID);
  });

  it('omits the status filter entirely when none was given', async () => {
    const { findMany, promise } = run(Role.ADMIN);
    await promise;
    expect(whereOf(findMany)).not.toHaveProperty('status');
  });

  it('hands the rows to ExcelService under a Spanish sheet name', async () => {
    const { generate, promise } = run(Role.ADMIN);
    await promise;
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ sheetName: 'Facturas' }),
    );
  });
});
