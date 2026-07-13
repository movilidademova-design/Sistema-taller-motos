import { parseDurationToMs, parseDurationToSeconds } from './duration.util';

describe('parseDurationToMs', () => {
  it('parses seconds, minutes, hours and days', () => {
    expect(parseDurationToMs('30s')).toBe(30_000);
    expect(parseDurationToMs('15m')).toBe(15 * 60_000);
    expect(parseDurationToMs('2h')).toBe(2 * 3_600_000);
    expect(parseDurationToMs('7d')).toBe(7 * 86_400_000);
  });

  it('throws on an invalid format', () => {
    expect(() => parseDurationToMs('invalid')).toThrow();
    expect(() => parseDurationToMs('10x')).toThrow();
  });
});

describe('parseDurationToSeconds', () => {
  it('converts to whole seconds', () => {
    expect(parseDurationToSeconds('15m')).toBe(900);
    expect(parseDurationToSeconds('1h')).toBe(3600);
  });
});
