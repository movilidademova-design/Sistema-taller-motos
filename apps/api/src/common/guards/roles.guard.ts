import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { POS_ROLES_KEY } from '../decorators/pos-roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PosRole, Role } from '../../generated/prisma/enums';
import { RequestWithUser } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      ROLES_KEY,
      targets,
    );
    const requiredPosRoles = this.reflector.getAllAndOverride<PosRole[]>(
      POS_ROLES_KEY,
      targets,
    );

    // Este guard es global y corre DESPUÉS de JwtAuthGuard, que en una ruta
    // @Public() devuelve true sin dejar usuario en la petición. Sin esta
    // comprobación, exigir rol más abajo dejaría el login fuera de servicio.
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) return false;

    const wantsTaller = !!requiredRoles?.length;
    const wantsPos = !!requiredPosRoles?.length;
    // Un endpoint sin exigencia explícita es del taller: hoy toda la API lo es,
    // y lo que debe ser accesible sin sesión ya se marca con @Public. Antes
    // bastaba con estar autenticado, porque cualquiera que entrara tenía rol de
    // taller; desde que existen cuentas solo-POS eso le abría al cajero las
    // órdenes, las facturas y la agenda. Lo que el POS necesite se marca con
    // @PosRoles a propósito, uno por uno.
    if (!wantsTaller && !wantsPos) return !!user.role;

    // Basta con cumplir uno de los dos lados: un endpoint puede ser para el
    // administrador del taller O para el del POS.
    const tallerOk =
      wantsTaller && !!user.role && requiredRoles.includes(user.role);
    const posOk =
      wantsPos && !!user.posRole && requiredPosRoles.includes(user.posRole);
    return tallerOk || posOk;
  }
}
