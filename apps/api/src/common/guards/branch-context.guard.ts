import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '../../generated/prisma/enums';
import type { RequestWithBranch } from '../decorators/current-branch.decorator';

/**
 * Runs after JwtAuthGuard. If the request carries an X-Branch-Id header, validates
 * that the branch belongs to the caller's tenant, then attaches the validated id to
 * the request only if it's currently usable by this caller (active, and — for
 * non-ADMIN — backed by an explicit UserBranch row).
 *
 * A header for a branch outside the caller's tenant hard-rejects the whole request
 * (403) — that shouldn't happen in normal use, since a client only ever learns
 * branch ids from its own tenant's endpoints, so it's treated as a red flag.
 *
 * A header for a branch that exists in-tenant but isn't currently usable (deactivated,
 * or a UserBranch row that was removed after this session's client already stored the
 * id) is different: it's a benign, in-session state change an admin can trigger at any
 * time, not a security violation. It does NOT hard-fail the request — this only skips
 * resolving `request.branchId`, same as if no header had been sent at all. That matters
 * because this guard is global and runs even on endpoints that don't need a branch
 * (like GET /users/me/branches, the self-recovery endpoint a client needs to reach to
 * pick a still-valid branch) — @CurrentBranch() throws its own 400 for any endpoint
 * that actually requires a resolved branch, so nothing is silently widened to
 * tenant-wide by leaving it unresolved.
 */
@Injectable()
export class BranchContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithBranch>();
    const headerBranchId = request.headers['x-branch-id'];
    const branchId = Array.isArray(headerBranchId)
      ? headerBranchId[0]
      : headerBranchId;
    if (!branchId || !request.user) return true;

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId: request.user.tenantId },
    });
    if (!branch) throw new ForbiddenException('Sucursal no encontrada');

    if (!branch.isActive) return true;

    if (request.user.role !== Role.ADMIN) {
      const access = await this.prisma.userBranch.findUnique({
        where: { userId_branchId: { userId: request.user.userId, branchId } },
      });
      if (!access) return true;
    }

    request.branchId = branch.id;
    return true;
  }
}
