import { PaymentsService } from './payments.service';
import { MAX_ROWS } from '../common/excel/excel.service';
import {
  findManyArgs,
  stubExcel,
  stubPrisma,
  whereOf,
} from '../common/testing/export-test-utils';
import { PaymentMethod, Role } from '../generated/prisma/enums';
import type { ExportPaymentsQueryDto } from './dto/export-payments-query.dto';

function makeService(overrides: {
  findMany: jest.Mock;
  generate?: jest.Mock;
}): PaymentsService {
  return new PaymentsService(
    stubPrisma('payment', overrides.findMany),
    stubExcel(overrides.generate),
  );
}

describe('PaymentsService.exportToExcel', () => {
  const tenantId = 'tenant-1';
  const currentBranch = 'branch-actual';
  const otherBranch = 'branch-ajeno';

  function run(role: Role, query: ExportPaymentsQueryDto = {}) {
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

  it('exports every branch for an ADMIN who picked none, with no branch/OR clause at all', async () => {
    const { findMany, promise } = run(Role.ADMIN);
    await promise;
    expect(whereOf(findMany)).not.toHaveProperty('branchId');
    expect(whereOf(findMany)).not.toHaveProperty('OR');
  });

  it('leaves orphan payments out of a branch-scoped export', async () => {
    // Payment no guarda su propia sucursal — se deriva de la orden asociada
    // (ver el comentario en el servicio). Un pago sin orden no pertenece a
    // ninguna sede, así que un reporte por sucursal lo deja fuera: si cada
    // sucursal lo incluyera, sumar los reportes de todas daría de más, y un
    // pago contado dos veces no salta a la vista al cuadrar caja. Decisión
    // confirmada con el usuario; este test la fija.
    const { findMany, promise } = run(Role.MANAGER);
    await promise;
    expect(whereOf(findMany)).not.toHaveProperty('OR');
    expect(whereOf(findMany).order).toEqual({ branchId: currentBranch });
  });

  it('includes orphan payments when an ADMIN exports every branch', async () => {
    // La contraparte: sin filtro de sucursal no hay condición sobre la orden,
    // así que los pagos huérfanos entran y salen marcados "Sin sucursal".
    const { findMany, promise } = run(Role.ADMIN);
    await promise;
    expect(whereOf(findMany)).not.toHaveProperty('order');
  });

  it('filters by payment date over the requested range', async () => {
    const { findMany, promise } = run(Role.ADMIN, {
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
    const { findMany, promise } = run(Role.ADMIN);
    await promise;
    expect(whereOf(findMany)).not.toHaveProperty('createdAt');
  });

  it('filters by payment method when given', async () => {
    const { findMany, promise } = run(Role.ADMIN, {
      method: PaymentMethod.TRANSFER,
    });
    await promise;
    expect(whereOf(findMany).method).toBe(PaymentMethod.TRANSFER);
  });

  it('omits the method filter entirely when none was given', async () => {
    const { findMany, promise } = run(Role.ADMIN);
    await promise;
    expect(whereOf(findMany)).not.toHaveProperty('method');
  });

  it('hands the rows to ExcelService under a Spanish sheet name', async () => {
    const { generate, promise } = run(Role.ADMIN);
    await promise;
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ sheetName: 'Pagos' }),
    );
  });
});
