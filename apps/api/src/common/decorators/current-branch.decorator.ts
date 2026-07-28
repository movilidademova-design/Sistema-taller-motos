import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestWithUser } from './current-user.decorator';

export type RequestWithBranch = RequestWithUser & { branchId?: string };

/** Throws if no valid X-Branch-Id header was resolved by BranchContextGuard. */
export const CurrentBranch = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<RequestWithBranch>();
    if (!request.branchId) {
      throw new BadRequestException('Sucursal no especificada');
    }
    return request.branchId;
  },
);
