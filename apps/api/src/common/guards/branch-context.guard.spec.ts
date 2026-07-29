import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { BranchContextGuard } from './branch-context.guard';
import { Role } from '../../generated/prisma/enums';
import type { RequestWithBranch } from '../decorators/current-branch.decorator';

function makeContext(request: Partial<RequestWithBranch>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('BranchContextGuard', () => {
  const tenantId = 'tenant-1';
  const userId = 'user-1';
  const branchId = 'branch-1';

  function makeGuard(overrides: {
    branch?: { id: string; tenantId: string; isActive: boolean } | null;
    userBranch?: unknown;
  }) {
    const prisma = {
      branch: {
        findFirst: jest.fn().mockResolvedValue(overrides.branch ?? null),
      },
      userBranch: {
        findUnique: jest.fn().mockResolvedValue(overrides.userBranch ?? null),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const guard = new BranchContextGuard(prisma as any);
    return { guard, prisma };
  }

  it('passes through when no X-Branch-Id header is present', async () => {
    const { guard, prisma } = makeGuard({});
    const request: Partial<RequestWithBranch> = {
      headers: {},
      user: { userId, tenantId, email: 'a@b.com', role: Role.ADMIN },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.branchId).toBeUndefined();
    expect(prisma.branch.findFirst).not.toHaveBeenCalled();
  });

  it('passes through when there is no authenticated user', async () => {
    const { guard } = makeGuard({});
    const request: Partial<RequestWithBranch> = {
      headers: { 'x-branch-id': branchId },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.branchId).toBeUndefined();
  });

  it('rejects a branch id that does not belong to the caller\'s tenant', async () => {
    const { guard } = makeGuard({ branch: null });
    const request: Partial<RequestWithBranch> = {
      headers: { 'x-branch-id': branchId },
      user: { userId, tenantId, email: 'a@b.com', role: Role.ADMIN },
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(ForbiddenException);
  });

  it('resolves the branch for an ADMIN with no UserBranch row needed', async () => {
    const { guard, prisma } = makeGuard({ branch: { id: branchId, tenantId, isActive: true } });
    const request: Partial<RequestWithBranch> = {
      headers: { 'x-branch-id': branchId },
      user: { userId, tenantId, email: 'a@b.com', role: Role.ADMIN },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.branchId).toBe(branchId);
    expect(prisma.userBranch.findUnique).not.toHaveBeenCalled();
  });

  it('resolves the branch for a non-ADMIN with a matching UserBranch row', async () => {
    const { guard } = makeGuard({
      branch: { id: branchId, tenantId, isActive: true },
      userBranch: { userId, branchId },
    });
    const request: Partial<RequestWithBranch> = {
      headers: { 'x-branch-id': branchId },
      user: { userId, tenantId, email: 'a@b.com', role: Role.RECEPTIONIST },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.branchId).toBe(branchId);
  });

  it('does NOT hard-reject a deactivated branch — leaves branchId unresolved instead', async () => {
    const { guard } = makeGuard({ branch: { id: branchId, tenantId, isActive: false } });
    const request: Partial<RequestWithBranch> = {
      headers: { 'x-branch-id': branchId },
      user: { userId, tenantId, email: 'a@b.com', role: Role.ADMIN },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.branchId).toBeUndefined();
  });

  it('does NOT hard-reject a non-ADMIN missing a UserBranch row — leaves branchId unresolved instead', async () => {
    const { guard } = makeGuard({
      branch: { id: branchId, tenantId, isActive: true },
      userBranch: null,
    });
    const request: Partial<RequestWithBranch> = {
      headers: { 'x-branch-id': branchId },
      user: { userId, tenantId, email: 'a@b.com', role: Role.RECEPTIONIST },
    };

    // This is the self-recovery guarantee: an endpoint that doesn't require a
    // resolved branch (e.g. GET /users/me/branches) must still succeed even
    // when the caller's stored branch id is no longer one they have access to,
    // so the frontend can recover and pick a still-valid branch.
    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.branchId).toBeUndefined();
  });

  it('reads the first value when X-Branch-Id is sent as multiple header values', async () => {
    const { guard, prisma } = makeGuard({ branch: { id: branchId, tenantId, isActive: true } });
    const request: Partial<RequestWithBranch> = {
      headers: { 'x-branch-id': [branchId, 'other-branch'] },
      user: { userId, tenantId, email: 'a@b.com', role: Role.ADMIN },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(prisma.branch.findFirst).toHaveBeenCalledWith({
      where: { id: branchId, tenantId },
    });
  });
});
