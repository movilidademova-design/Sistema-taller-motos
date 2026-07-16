import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PermissionOverrideDto } from './dto/update-permissions.dto';
import { Role } from '../generated/prisma/enums';
import {
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
} from '../common/permissions/permission.constants';

interface Actor {
  role: Role;
  storeIds: string[];
}

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
  storeMemberships: { include: { store: { select: { id: true, name: true, code: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return users.map(this.withStores);
  }

  async findOne(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: SAFE_SELECT,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return this.withStores(user);
  }

  async findTechnicians(tenantId: string, storeId: string | null) {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: 'TECHNICIAN',
        isActive: true,
        ...(storeId ? { storeMemberships: { some: { storeId } } } : {}),
      },
      select: SAFE_SELECT,
    });
    return users.map(this.withStores);
  }

  async create(tenantId: string, actor: Actor, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Ese correo ya está registrado');

    this.assertCanAssign(actor, dto.role, dto.storeIds);
    await this.assertStoresBelongToTenant(tenantId, dto.storeIds);

    const passwordHash = await argon2.hash(dto.password);
    const { storeIds, ...rest } = dto;
    const user = await this.prisma.user.create({
      data: {
        ...rest,
        tenantId,
        passwordHash,
        storeMemberships: { create: storeIds.map((storeId) => ({ storeId })) },
      },
      select: SAFE_SELECT,
    });
    return this.withStores(user);
  }

  async update(tenantId: string, actor: Actor, id: string, dto: UpdateUserDto) {
    await this.findOne(tenantId, id);
    this.assertCanAssign(actor, dto.role, dto.storeIds);
    const { storeIds, ...rest } = dto;
    if (storeIds) {
      await this.assertStoresBelongToTenant(tenantId, storeIds);
      await this.prisma.userStoreMembership.deleteMany({ where: { userId: id } });
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(storeIds
          ? { storeMemberships: { create: storeIds.map((storeId) => ({ storeId })) } }
          : {}),
      },
      select: SAFE_SELECT,
    });
    return this.withStores(user);
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    // Users are never hard-deleted so historical order/audit references stay intact.
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: SAFE_SELECT,
    });
    return this.withStores(user);
  }

  /** Catálogo completo + qué trae el rol por defecto + qué tiene overrideado este usuario en particular. */
  async getPermissions(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      include: { permissionOverrides: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const roleDefaults = new Set(ROLE_DEFAULT_PERMISSIONS[user.role]);
    return {
      role: user.role,
      permissions: PERMISSIONS.map((key) => {
        const override = user.permissionOverrides.find((o) => o.permission === key);
        return {
          key,
          roleDefault: roleDefaults.has(key),
          override: override?.granted ?? null,
          effective: override ? override.granted : roleDefaults.has(key),
        };
      }),
    };
  }

  async updatePermissions(tenantId: string, id: string, overrides: PermissionOverrideDto[]) {
    await this.findOne(tenantId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.userPermissionOverride.deleteMany({ where: { userId: id } });
      if (overrides.length) {
        await tx.userPermissionOverride.createMany({
          data: overrides.map((o) => ({ userId: id, permission: o.permission, granted: o.granted })),
        });
      }
    });
    return this.getPermissions(tenantId, id);
  }

  /**
   * Un Administrador de Tienda (MANAGER) gestiona usuarios de SU tienda, no
   * de cualquiera: no puede crear/ascender a otro Super Administrador ni
   * asignar sucursales a las que él mismo no pertenece. Role.ADMIN no tiene
   * esta restricción.
   */
  private assertCanAssign(actor: Actor, role: Role | undefined, storeIds: string[] | undefined) {
    if (actor.role === Role.ADMIN) return;
    if (role === Role.ADMIN) {
      throw new ForbiddenException('Solo el Super Administrador puede crear otro Super Administrador');
    }
    const actorStores = new Set(actor.storeIds);
    if (storeIds?.some((id) => !actorStores.has(id))) {
      throw new ForbiddenException('No puedes asignar una sucursal a la que tú mismo no perteneces');
    }
  }

  private async assertStoresBelongToTenant(tenantId: string, storeIds: string[]) {
    const count = await this.prisma.store.count({
      where: { tenantId, id: { in: storeIds } },
    });
    if (count !== storeIds.length) {
      throw new NotFoundException('Una de las sucursales no es válida');
    }
  }

  private withStores<T extends { storeMemberships: { store: unknown }[] }>(
    user: T,
  ): Omit<T, 'storeMemberships'> & { stores: unknown[] } {
    const { storeMemberships, ...rest } = user;
    return { ...rest, stores: storeMemberships.map((m) => m.store) };
  }
}
