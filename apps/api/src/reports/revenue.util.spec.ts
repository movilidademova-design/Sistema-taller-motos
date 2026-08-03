import { dateRangeFilter } from '../common/utils/export-filters.util';
import { RevenueGroupBy } from './dto/revenue-report-query.dto';
import { periodKey } from './revenue.util';

describe('periodKey', () => {
  const date = new Date('2026-07-15T18:30:00.000Z');

  it('formats a day bucket as YYYY-MM-DD', () => {
    expect(periodKey(date, RevenueGroupBy.DAY)).toBe('2026-07-15');
  });

  it('formats a month bucket as YYYY-MM', () => {
    expect(periodKey(date, RevenueGroupBy.MONTH)).toBe('2026-07');
  });

  it('pads single-digit months and days', () => {
    expect(
      periodKey(new Date('2026-01-10T12:00:00.000Z'), RevenueGroupBy.DAY),
    ).toBe('2026-01-10');
  });

  it('groups by the workshop clock, not UTC', () => {
    // 20:00 del 31 de julio en Bogotá son las 01:00 UTC del 1 de agosto.
    const lateJulyEvening = new Date('2026-08-01T01:00:00.000Z');

    expect(periodKey(lateJulyEvening, RevenueGroupBy.MONTH)).toBe('2026-07');
    expect(periodKey(lateJulyEvening, RevenueGroupBy.DAY)).toBe('2026-07-31');
  });

  it('agrees with the range filter about which period a date belongs to', () => {
    // El bug que este test existe para que no vuelva: el rango se recortaba en
    // hora local y los grupos se armaban en UTC, así que una factura de la
    // noche del 31 entraba en un reporte "hasta el 31 de julio" pero salía
    // etiquetada "2026-08". Un reporte de julio mostrando una fila de agosto.
    const lateJulyEvening = new Date('2026-08-01T01:00:00.000Z');
    const july = dateRangeFilter('2026-07-01', '2026-07-31')!;

    const insideRange =
      lateJulyEvening >= july.gte! && lateJulyEvening < july.lt!;
    expect(insideRange).toBe(true);
    expect(periodKey(lateJulyEvening, RevenueGroupBy.MONTH)).toBe('2026-07');
  });

  it('still rolls over to the next period at local midnight', () => {
    // 00:30 del 1 de agosto en Bogotá = 05:30 UTC. Ya es agosto.
    const justAfterLocalMidnight = new Date('2026-08-01T05:30:00.000Z');

    expect(periodKey(justAfterLocalMidnight, RevenueGroupBy.MONTH)).toBe(
      '2026-08',
    );
    expect(periodKey(justAfterLocalMidnight, RevenueGroupBy.DAY)).toBe(
      '2026-08-01',
    );
  });
});
