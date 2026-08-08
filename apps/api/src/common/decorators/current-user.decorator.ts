import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { PosRole, Role } from '../../generated/prisma/enums';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email: string;
  role: Role | null;
  posRole: PosRole | null;
}

export type RequestWithUser = Request & { user?: AuthenticatedUser };

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
