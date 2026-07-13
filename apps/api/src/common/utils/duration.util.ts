import { BadRequestException } from '@nestjs/common';

const UNIT_MULTIPLIERS_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parses simple duration strings like "15m", "7d" into milliseconds. */
export function parseDurationToMs(expr: string): number {
  const match = /^(\d+)([smhd])$/.exec(expr);
  if (!match)
    throw new BadRequestException(`Formato de duración inválido: ${expr}`);
  return Number(match[1]) * UNIT_MULTIPLIERS_MS[match[2]];
}

/** Same as parseDurationToMs but in whole seconds, for JWT expiresIn options. */
export function parseDurationToSeconds(expr: string): number {
  return Math.floor(parseDurationToMs(expr) / 1000);
}
