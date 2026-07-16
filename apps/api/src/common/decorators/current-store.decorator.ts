import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithUser } from './current-user.decorator';

/**
 * Sucursal activa de la request, ya validada por StoreScopeGuard contra las
 * membresías del usuario. `null` significa "todas las tiendas" (solo posible
 * para Role.ADMIN, vía el header `X-Store-Id: all`).
 */
export const CurrentStore = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.storeId ?? null;
  },
);
