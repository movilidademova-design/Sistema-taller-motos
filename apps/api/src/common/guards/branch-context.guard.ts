import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '../../generated/prisma/enums';
import type { RequestWithBranch } from '../decorators/current-branch.decorator';

/**
 * Runs after JwtAuthGuard. If the request carries an X-Branch-Id header, validates
 * that the branch belongs to the caller's tenant, is active, and that the caller
 * may access it (ADMIN can access every active branch in their tenant automatically;
 * any other role must have an explicit UserBranch row), then attaches the validated
 * id to the request. A deactivated branch is treated the same as a nonexistent one —
 * a stale X-Branch-Id header pointing at one is rejected, not silently honored.
 * Does NOT reject requests with no header — individual endpoints that require a
 * branch use `@CurrentBranch()`, which throws on its own if nothing was resolved here.
 */
@Injectable()
export class BranchContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithBranch>();
    const headerBranchId = request.headers['x-branch-id'];
    const branchId = Array.isArray(headerBranchId) ? headerBranchId[0] : headerBranchId;
    if (!branchId || !request.user) return true;

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId: request.user.tenantId, isActive: true },
    });
    if (!branch) throw new ForbiddenException('Sucursal no encontrada');

    if (request.user.role !== Role.ADMIN) {
      const access = await this.prisma.userBranch.findUnique({
        where: { userId_branchId: { userId: request.user.userId, branchId } },
      });
      if (!access) throw new ForbiddenException('No tienes acceso a esa sucursal');
    }

    request.branchId = branch.id;
    return true;
  }
}
