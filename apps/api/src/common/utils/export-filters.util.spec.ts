import { BadRequestException } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';
import { dateRangeFilter, resolveExportBranchId } from './export-filters.util';

describe('dateRangeFilter', () => {
  it('returns undefined when neither bound is given, so the caller omits the filter', () => {
    expect(dateRangeFilter(undefined, undefined)).toBeUndefined();
  });

  it('anchors the lower bound to local midnight, not UTC midnight', () => {
    // El taller está en UTC-5: la medianoche local del 1 de julio son las 05:00
    // UTC. Usar la medianoche UTC arrastraría cinco horas del 30 de junio.
    expect(dateRangeFilter('2026-07-01', undefined)).toEqual({
      gte: new Date('2026-07-01T05:00:00.000Z'),
    });
  });

  it('makes the upper bound inclusive of the whole local day', () => {
    // Quien pide "hasta el 31 de julio" espera todo el 31 en hora local. Un
    // `lte` a medianoche del 31 dejaría fuera el día entero, y un `lt` a
    // medianoche UTC del 1 de agosto cortaría a las 19:00 hora local del 31.
    expect(dateRangeFilter(undefined, '2026-07-31')).toEqual({
      lt: new Date('2026-08-01T05:00:00.000Z'),
    });
  });

  it('combines both bounds', () => {
    expect(dateRangeFilter('2026-07-01', '2026-07-31')).toEqual({
      gte: new Date('2026-07-01T05:00:00.000Z'),
      lt: new Date('2026-08-01T05:00:00.000Z'),
    });
  });

  it('includes a record created late on the last evening of the range', () => {
    // 20:30 hora local del 31 de julio = 01:30 UTC del 1 de agosto. Es el caso
    // exacto que se perdía anclando el límite a UTC.
    const lateSale = new Date('2026-08-01T01:30:00.000Z');
    const { lt } = dateRangeFilter('2026-07-01', '2026-07-31')!;

    expect(lateSale.getTime()).toBeLessThan(lt!.getTime());
  });

  it('rejects a malformed date instead of handing Prisma an Invalid Date', () => {
    expect(() => dateRangeFilter('ayer', undefined)).toThrow(
      BadRequestException,
    );
    expect(() => dateRangeFilter(undefined, '31-07-2026')).toThrow(
      BadRequestException,
    );
  });
});

describe('resolveExportBranchId', () => {
  const currentBranch = 'branch-actual';
  const otherBranch = 'branch-ajeno';

  it('pins a MANAGER to their active branch', () => {
    expect(resolveExportBranchId(Role.MANAGER, currentBranch, undefined)).toBe(
      currentBranch,
    );
  });

  it('ignores a branchId a MANAGER tries to request for another branch', () => {
    expect(resolveExportBranchId(Role.MANAGER, currentBranch, otherBranch)).toBe(
      currentBranch,
    );
  });

  it.each([Role.RECEPTIONIST, Role.TECHNICIAN, Role.CLIENT])(
    'pins %s to their active branch too, in case an endpoint forgets @Roles',
    (role) => {
      // RolesGuard deja pasar cualquier rol si al endpoint le falta @Roles, así
      // que estos roles nunca deben caer en la rama "ve todas las sucursales".
      expect(resolveExportBranchId(role, currentBranch, otherBranch)).toBe(
        currentBranch,
      );
      expect(resolveExportBranchId(role, currentBranch, undefined)).toBe(
        currentBranch,
      );
    },
  );

  it('lets an ADMIN narrow the export to a chosen branch', () => {
    expect(resolveExportBranchId(Role.ADMIN, currentBranch, otherBranch)).toBe(
      otherBranch,
    );
  });

  it('returns undefined for an ADMIN who asked for no branch, meaning all branches', () => {
    expect(
      resolveExportBranchId(Role.ADMIN, currentBranch, undefined),
    ).toBeUndefined();
  });
});
