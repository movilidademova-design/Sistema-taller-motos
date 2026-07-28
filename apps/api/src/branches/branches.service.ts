import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async create(tenantId: string, dto: CreateBranchDto) {
    const existing = await this.prisma.branch.findFirst({
      where: { tenantId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException('Ya existe una sucursal con ese código');
    }
    return this.prisma.branch.create({ data: { tenantId, ...dto } });
  }

  async update(tenantId: string, id: string, dto: UpdateBranchDto) {
    await this.assertExists(tenantId, id);
    if (dto.code) {
      const existing = await this.prisma.branch.findFirst({
        where: { tenantId, code: dto.code, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException('Ya existe una sucursal con ese código');
      }
    }
    return this.prisma.branch.update({ where: { id }, data: dto });
  }

  private async assertExists(tenantId: string, id: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id, tenantId } });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');
    return branch;
  }
}
