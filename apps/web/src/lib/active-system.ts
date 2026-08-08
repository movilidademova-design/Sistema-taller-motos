import type { PosRole, Role } from '@taller/shared';

export type SystemId = 'TALLER' | 'POS';

export const SYSTEM_HOME: Record<SystemId, string> = {
  TALLER: '/dashboard',
  POS: '/pos',
};

export const SYSTEM_LABELS: Record<SystemId, string> = {
  TALLER: 'Taller',
  POS: 'Punto de venta',
};

/** El sistema activo se deduce de la URL. No hay estado que guardar ni que
 * sincronizar: la ruta ya es la única fuente de verdad. */
export function systemForPath(pathname: string): SystemId {
  return pathname === '/pos' || pathname.startsWith('/pos/') ? 'POS' : 'TALLER';
}

/** A qué sistemas puede entrar el usuario. El orden importa: es el que se ve
 * en el selector y decide a dónde va quien solo tiene uno. */
export function systemsForUser(
  user: { role: Role | null; posRole: PosRole | null } | null,
): SystemId[] {
  if (!user) return [];
  const systems: SystemId[] = [];
  if (user.role) systems.push('TALLER');
  if (user.posRole) systems.push('POS');
  return systems;
}
