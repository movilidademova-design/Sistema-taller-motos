import { Role } from '../../generated/prisma/enums';
import {
  dateRangeFilter,
  resolveExportBranchId,
} from './export-filters.util';

describe('dateRangeFilter', () => {
  it('returns undefined when neither bound is given, so the caller omits the filter', () => {
    expect(dateRangeFilter(undefined, undefined)).toBeUndefined();
  });

  it('builds a gte filter from the lower bound only', () => {
    expect(dateRangeFilter('2026-07-01', undefined)).toEqual({
      gte: new Date('2026-07-01T00:00:00.000Z'),
    });
  });

  it('makes the upper bound inclusive of the whole day', () => {
    // A user picking "hasta 31 de julio" means through the end of the 31st.
    // lte: 2026-07-31T00:00:00Z would silently drop everything that day.
    expect(dateRangeFilter(undefined, '2026-07-31')).toEqual({
      lt: new Date('2026-08-01T00:00:00.000Z'),
    });
  });

  it('combines both bounds', () => {
    expect(dateRangeFilter('2026-07-01', '2026-07-31')).toEqual({
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lt: new Date('2026-08-01T00:00:00.000Z'),
    });
  });
});

describe('resolveExportBranchId', () => {
  const currentBranch = 'branch-actual';
  const otherBranch = 'branch-ajeno';

  it('pins a MANAGER to their active branch', () => {
    expect(
      resolveExportBranchId(Role.MANAGER, currentBranch, undefined),
    ).toBe(currentBranch);
  });

  it('ignores a branchId a MANAGER tries to request for another branch', () => {
    expect(
      resolveExportBranchId(Role.MANAGER, currentBranch, otherBranch),
    ).toBe(currentBranch);
  });

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
