import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { POS_ROLES_KEY } from '../decorators/pos-roles.decorator';
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

    const wantsTaller = !!requiredRoles?.length;
    const wantsPos = !!requiredPosRoles?.length;
    // Sin ninguna exigencia el endpoint queda abierto, que es como se ha
    // comportado siempre; cambiarlo aquí cerraría media API de golpe.
    if (!wantsTaller && !wantsPos) return true;

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) return false;

    // Basta con cumplir uno de los dos lados: un endpoint puede ser para el
    // administrador del taller O para el del POS.
    const tallerOk =
      wantsTaller && !!user.role && requiredRoles.includes(user.role);
    const posOk =
      wantsPos && !!user.posRole && requiredPosRoles.includes(user.posRole);
    return tallerOk || posOk;
  }
}
