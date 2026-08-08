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
import { PosRole, Role } from '../generated/prisma/enums';

const SAFE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  posRole: true,
  isActive: true,
  avatarUrl: true,
  lastLoginAt: true,
  createdAt: true,
};

/** ADMIN de cualquiera de los dos sistemas ve todas las sucursales: un
 * administrador del POS necesita ver todas las cajas aunque no toque el taller. */
function isAnyAdmin(role: Role | null, posRole: PosRole | null) {
  return role === Role.ADMIN || posRole === PosRole.ADMIN;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, actorUserId: string, actorRole: Role | null) {
    if (actorRole === Role.MANAGER) {
      const managerBranchIds = await this.userBranchIds(actorUserId);
      return this.prisma.user.findMany({
        where: {
          tenantId,
          branches: { some: { branchId: { in: managerBranchIds } } },
        },
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
    actorRole: Role | null,
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
      const sharesBranch = targetBranchIds.some((b) =>
        managerBranchIds.includes(b),
      );
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
    actorRole: Role | null,
    dto: CreateUserDto,
  ) {
    // Una cuenta sin rol en ningún sistema puede iniciar sesión y no puede ir
    // a ninguna parte. La base tiene la misma regla como restricción CHECK.
    if (!dto.role && !dto.posRole) {
      throw new BadRequestException(
        'El usuario debe tener acceso al menos a un sistema.',
      );
    }
    if (
      actorRole === Role.MANAGER &&
      (dto.role === Role.ADMIN || dto.posRole === PosRole.ADMIN)
    ) {
      throw new ForbiddenException('No puedes crear un usuario Administrador');
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Ese correo ya está registrado');

    // Un ADMIN (de cualquiera de los dos sistemas) ve todas las sucursales, así
    // que no necesita asignación. Un usuario creado por un GERENTE hereda las
    // sucursales del gerente — no hay nada que elegir. Un ADMIN creando a otro
    // debe elegir, porque no tiene "sucursal propia" de la cual heredar.
    let branchIds: string[] = [];
    if (!isAnyAdmin(dto.role ?? null, dto.posRole ?? null)) {
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
          throw new NotFoundException(
            'Alguna sucursal no pertenece a este taller',
          );
        }
        branchIds = dto.branchIds;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- excluded from `rest` so it never reaches Prisma's create()
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
    actorRole: Role | null,
    id: string,
    dto: UpdateUserDto,
  ) {
    const target = await this.findOneScoped(
      tenantId,
      actorUserId,
      actorRole,
      id,
    );
    if (
      actorRole === Role.MANAGER &&
      (dto.role === Role.ADMIN || dto.posRole === PosRole.ADMIN)
    ) {
      throw new ForbiddenException('No puedes asignar el rol Administrador');
    }
    // Se evalúa el resultado, no lo que llega: una edición parcial que solo
    // manda `role: null` deja el posRole que ya tenía, y eso sí es válido.
    const finalRole = dto.role === undefined ? target.role : dto.role;
    const finalPosRole =
      dto.posRole === undefined ? target.posRole : dto.posRole;
    if (!finalRole && !finalPosRole) {
      throw new BadRequestException(
        'El usuario debe tener acceso al menos a un sistema.',
      );
    }
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: SAFE_SELECT,
    });
  }

  async remove(
    tenantId: string,
    actorUserId: string,
    actorRole: Role | null,
    id: string,
  ) {
    await this.findOneScoped(tenantId, actorUserId, actorRole, id);
    // Users are never hard-deleted so historical order/audit references stay intact.
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: SAFE_SELECT,
    });
  }

  async findMyBranches(
    tenantId: string,
    userId: string,
    role: Role | null,
    posRole: PosRole | null,
  ) {
    if (isAnyAdmin(role, posRole)) {
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
