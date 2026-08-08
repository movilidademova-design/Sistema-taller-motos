import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { PosRole, Role } from '../../generated/prisma/enums';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { POS_ROLES_KEY } from '../decorators/pos-roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/** Un Reflector falso que devuelve lo que se le indique por clave de metadatos. */
function makeReflector(metadata: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
}

function contextFor(user: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const tallerAdmin = { role: Role.ADMIN, posRole: null };
  const posAdmin = { role: null, posRole: PosRole.ADMIN };
  const cashier = { role: null, posRole: PosRole.CASHIER };

  it('deja pasar una ruta pública aunque no haya usuario', () => {
    const guard = new RolesGuard(makeReflector({ [IS_PUBLIC_KEY]: true }));
    expect(guard.canActivate(contextFor(undefined))).toBe(true);
  });

  it('sin roles exigidos, deja pasar a quien tiene rol de taller', () => {
    const guard = new RolesGuard(makeReflector({}));
    expect(guard.canActivate(contextFor(tallerAdmin))).toBe(true);
  });

  // El agujero que abrió esta fase: /orders, /invoices, /appointments y
  // /dashboard/summary no declaran @Roles, así que antes bastaba con estar
  // autenticado. Cuando aparecieron las cuentas solo-POS, eso le entregaba al
  // cajero el taller entero, que es justo lo que el diseño prohíbe.
  it('sin roles exigidos, NO deja pasar a una cuenta solo-POS', () => {
    const guard = new RolesGuard(makeReflector({}));
    expect(guard.canActivate(contextFor(cashier))).toBe(false);
    expect(guard.canActivate(contextFor(posAdmin))).toBe(false);
  });

  it('deja pasar cuando coincide el rol de taller', () => {
    const guard = new RolesGuard(makeReflector({ [ROLES_KEY]: [Role.ADMIN] }));
    expect(guard.canActivate(contextFor(tallerAdmin))).toBe(true);
  });

  it('deja pasar cuando coincide el rol de POS', () => {
    const guard = new RolesGuard(
      makeReflector({ [POS_ROLES_KEY]: [PosRole.ADMIN] }),
    );
    expect(guard.canActivate(contextFor(posAdmin))).toBe(true);
  });

  it('deja pasar si coincide cualquiera de los dos', () => {
    const guard = new RolesGuard(
      makeReflector({
        [ROLES_KEY]: [Role.ADMIN, Role.MANAGER],
        [POS_ROLES_KEY]: [PosRole.ADMIN],
      }),
    );
    expect(guard.canActivate(contextFor(posAdmin))).toBe(true);
    expect(guard.canActivate(contextFor(tallerAdmin))).toBe(true);
    expect(guard.canActivate(contextFor(cashier))).toBe(false);
  });

  // La razón de que sean dos claves de metadatos y no una sola lista mezclada:
  // Role.ADMIN y PosRole.ADMIN son la MISMA cadena 'ADMIN'. Con una sola lista,
  // un endpoint del taller marcado @Roles(Role.ADMIN) dejaría entrar a un
  // administrador del POS que no tiene ningún rol en el taller.
  it('NO deja entrar a un admin del POS en un endpoint que solo exige rol de taller', () => {
    const guard = new RolesGuard(makeReflector({ [ROLES_KEY]: [Role.ADMIN] }));
    expect(guard.canActivate(contextFor(posAdmin))).toBe(false);
  });

  it('niega cuando no hay usuario', () => {
    const guard = new RolesGuard(makeReflector({ [ROLES_KEY]: [Role.ADMIN] }));
    expect(guard.canActivate(contextFor(undefined))).toBe(false);
  });
});
