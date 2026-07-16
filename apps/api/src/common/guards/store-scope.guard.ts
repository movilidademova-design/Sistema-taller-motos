import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';
import { RequestWithUser } from '../decorators/current-user.decorator';

/**
 * Resuelve y valida la sucursal activa de cada request a partir del header
 * `X-Store-Id`, dejándola en `request.storeId` para que @CurrentStore() la
 * lea. Corre para toda request autenticada — así ningún endpoint puede
 * filtrarse "sin querer" por una tienda que el usuario no tiene asignada,
 * ni siquiera llamando el API directamente con un storeId ajeno.
 */
@Injectable()
export class StoreScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) return true; // endpoints públicos: nada que resolver

    const header = request.headers['x-store-id'];
    const requested = Array.isArray(header) ? header[0] : header;

    if (!requested) {
      request.storeId = user.storeIds[0] ?? null;
      return true;
    }
    if (requested === 'all') {
      if (user.role !== Role.ADMIN) {
        throw new ForbiddenException(
          'Solo el Super Administrador puede ver todas las sucursales a la vez',
        );
      }
      request.storeId = null;
      return true;
    }
    if (!user.storeIds.includes(requested)) {
      throw new ForbiddenException('No tienes acceso a esa sucursal');
    }
    request.storeId = requested;
    return true;
  }
}
