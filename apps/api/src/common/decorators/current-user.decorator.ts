import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '../../generated/prisma/enums';
import { PermissionKey } from '../permissions/permission.constants';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email: string;
  role: Role;
  storeIds: string[];
  permissions: Record<PermissionKey, boolean>;
}

export type RequestWithUser = Request & {
  user?: AuthenticatedUser;
  storeId?: string | null;
};

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
