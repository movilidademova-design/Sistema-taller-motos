import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '../generated/prisma/enums';

const SAFE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  avatarUrl: true,
  lastLoginAt: true,
  createdAt: true,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, actorUserId: string, actorRole: Role) {
    if (actorRole === Role.MANAGER) {
      const managerBranchIds = await this.userBranchIds(actorUserId);
      return this.prisma.user.findMany({
        where: { tenantId, branches: { some: { branchId: { in: managerBranchIds } } } },
        select: SAFE_SELECT,
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.user.findMany({
      where: { tenantId },
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: SAFE_SELECT,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  /** Same as findOne, but 404s (hides existence) if actorRole is MANAGER and the
   * target is an ADMIN or doesn't share a branch with the manager. Used by
   * update/remove before mutating. */
  private async findOneScoped(
    tenantId: string,
    actorUserId: string,
    actorRole: Role,
    id: string,
  ) {
    const target = await this.findOne(tenantId, id);
    if (actorRole === Role.MANAGER) {
      if (target.role === Role.ADMIN) {
        throw new NotFoundException('Usuario no encontrado');
      }
      const [managerBranchIds, targetBranchIds] = await Promise.all([
        this.userBranchIds(actorUserId),
        this.userBranchIds(id),
      ]);
      const sharesBranch = targetBranchIds.some((b) => managerBranchIds.includes(b));
      if (!sharesBranch) throw new NotFoundException('Usuario no encontrado');
    }
    return target;
  }

  async findTechnicians(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, role: 'TECHNICIAN', isActive: true },
      select: SAFE_SELECT,
    });
  }

  async create(
    tenantId: string,
    actorUserId: string,
    actorRole: Role,
    dto: CreateUserDto,
  ) {
    if (actorRole === Role.MANAGER && dto.role === Role.ADMIN) {
      throw new ForbiddenException('No puedes crear un usuario Administrador');
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Ese correo ya está registrado');

    // ADMIN-role users need no branch assignment (they see every branch
    // automatically). A MANAGER-created user is auto-scoped to the manager's own
    // branches — no choice to make. An ADMIN creating anyone else must choose
    // explicitly, since an ADMIN has no "own branch" to default to.
    let branchIds: string[] = [];
    if (dto.role !== Role.ADMIN) {
      if (actorRole === Role.MANAGER) {
        branchIds = await this.userBranchIds(actorUserId);
      } else {
        if (!dto.branchIds?.length) {
          throw new BadRequestException('Debes indicar al menos una sucursal');
        }
        const branches = await this.prisma.branch.findMany({
          where: { id: { in: dto.branchIds }, tenantId },
        });
        if (branches.length !== dto.branchIds.length) {
          throw new NotFoundException('Alguna sucursal no pertenece a este taller');
        }
        branchIds = dto.branchIds;
      }
    }

    const { password, branchIds: _ignoredBranchIds, ...rest } = dto;
    const passwordHash = await argon2.hash(password);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { ...rest, tenantId, passwordHash },
        select: SAFE_SELECT,
      });
      if (branchIds.length) {
        await tx.userBranch.createMany({
          data: branchIds.map((branchId) => ({ userId: user.id, branchId })),
        });
      }
      return user;
    });
  }

  async update(
    tenantId: string,
    actorUserId: string,
    actorRole: Role,
    id: string,
    dto: UpdateUserDto,
  ) {
    await this.findOneScoped(tenantId, actorUserId, actorRole, id);
    if (actorRole === Role.MANAGER && dto.role === Role.ADMIN) {
      throw new ForbiddenException('No puedes asignar el rol Administrador');
    }
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: SAFE_SELECT,
    });
  }

  async remove(tenantId: string, actorUserId: string, actorRole: Role, id: string) {
    await this.findOneScoped(tenantId, actorUserId, actorRole, id);
    // Users are never hard-deleted so historical order/audit references stay intact.
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: SAFE_SELECT,
    });
  }

  async findMyBranches(tenantId: string, userId: string, role: Role) {
    if (role === Role.ADMIN) {
      return this.prisma.branch.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
      });
    }
    const assignments = await this.prisma.userBranch.findMany({
      where: { userId, branch: { tenantId, isActive: true } },
      include: { branch: true },
    });
    return assignments.map((a) => a.branch);
  }

  async assignBranches(tenantId: string, userId: string, branchIds: string[]) {
    await this.findOne(tenantId, userId);
    const uniqueBranchIds = [...new Set(branchIds)];
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: uniqueBranchIds }, tenantId },
    });
    if (branches.length !== uniqueBranchIds.length) {
      throw new NotFoundException('Alguna sucursal no pertenece a este taller');
    }
    await this.prisma.$transaction([
      this.prisma.userBranch.deleteMany({ where: { userId } }),
      this.prisma.userBranch.createMany({
        data: uniqueBranchIds.map((branchId) => ({ userId, branchId })),
      }),
    ]);
    return this.prisma.userBranch.findMany({
      where: { userId },
      include: { branch: true },
    });
  }

  async findUserBranches(tenantId: string, userId: string) {
    await this.findOne(tenantId, userId);
    return this.prisma.userBranch.findMany({
      where: { userId },
      include: { branch: true },
    });
  }

  private async userBranchIds(userId: string): Promise<string[]> {
    const assignments = await this.prisma.userBranch.findMany({
      where: { userId },
      select: { branchId: true },
    });
    return assignments.map((a) => a.branchId);
  }
}
