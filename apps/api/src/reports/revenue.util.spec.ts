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
      periodKey(new Date('2026-01-05T00:00:00.000Z'), RevenueGroupBy.DAY),
    ).toBe('2026-01-05');
  });
});
