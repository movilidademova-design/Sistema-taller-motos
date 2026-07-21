import { randomInt } from 'crypto';

/** Generates a random 6-digit numeric pickup code, e.g. "482931". */
export function generatePickupCode(): string {
  return String(randomInt(100_000, 1_000_000));
}
