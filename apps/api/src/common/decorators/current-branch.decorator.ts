import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestWithUser } from './current-user.decorator';

export type RequestWithBranch = RequestWithUser & {
  branchId?: string;
  /** El header traía una sucursal, pero el guard no pudo dársela a este usuario. */
  branchUnavailable?: boolean;
};

/** Throws if no valid X-Branch-Id header was resolved by BranchContextGuard. */
export const CurrentBranch = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<RequestWithBranch>();
    if (!request.branchId) {
      // Distinguir los dos casos importa: "no mandaste sucursal" es un error de
      // programación del cliente, mientras que "esa sucursal ya no es tuya" le
      // pasa a un usuario real cuando le cambian los permisos, y el mensaje
      // tiene que decirle qué hacer.
      throw new BadRequestException(
        request.branchUnavailable
          ? 'No tienes acceso a esa sucursal, o fue desactivada. Elige otra.'
          : 'Sucursal no especificada',
      );
    }
    return request.branchId;
  },
);
