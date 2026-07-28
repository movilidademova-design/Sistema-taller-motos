import {
  ConflictException,
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

  async findAll(tenantId: string) {
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

  async findTechnicians(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, role: 'TECHNICIAN', isActive: true },
      select: SAFE_SELECT,
    });
  }

  async create(tenantId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Ese correo ya está registrado');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: { ...dto, tenantId, passwordHash },
      select: SAFE_SELECT,
    });
    return user;
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    await this.findOne(tenantId, id);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: SAFE_SELECT,
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
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
      where: { userId },
      include: { branch: true },
    });
    return assignments
      .map((a) => a.branch)
      .filter((b) => b.tenantId === tenantId && b.isActive);
  }

  async assignBranches(tenantId: string, userId: string, branchIds: string[]) {
    await this.findOne(tenantId, userId);
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds }, tenantId },
    });
    if (branches.length !== branchIds.length) {
      throw new NotFoundException('Alguna sucursal no pertenece a este taller');
    }
    await this.prisma.$transaction([
      this.prisma.userBranch.deleteMany({ where: { userId } }),
      this.prisma.userBranch.createMany({
        data: branchIds.map((branchId) => ({ userId, branchId })),
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
}
