import { generatePickupCode } from './pickup-code.util';

describe('generatePickupCode', () => {
  it('generates a 6-digit numeric string', () => {
    for (let i = 0; i < 50; i++) {
      const code = generatePickupCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('generates values across the full range, not just small numbers', () => {
    const codes = Array.from({ length: 200 }, () =>
      Number(generatePickupCode()),
    );
    expect(Math.min(...codes)).toBeGreaterThanOrEqual(100_000);
    expect(Math.max(...codes)).toBeLessThanOrEqual(999_999);
  });
});
