import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Taller no encontrado');
    return tenant;
  }

  async updateSettings(tenantId: string, dto: UpdateTenantDto) {
    await this.getSettings(tenantId);
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...dto,
        businessHours: dto.businessHours as Prisma.InputJsonValue,
      },
    });
  }
}
