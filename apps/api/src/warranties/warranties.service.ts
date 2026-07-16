import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarrantyDto } from './dto/create-warranty.dto';
import { ResolveWarrantyDto } from './dto/resolve-warranty.dto';
import { WarrantyStatus } from '../generated/prisma/enums';

@Injectable()
export class WarrantiesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, storeId: string | null) {
    return this.prisma.warranty.findMany({
      where: { tenantId, ...(storeId ? { storeId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        client: true,
        motorcycle: true,
        order: { select: { orderNumber: true } },
      },
    });
  }

  async findOne(tenantId: string, storeId: string | null, id: string) {
    const warranty = await this.prisma.warranty.findFirst({
      where: { id, tenantId, ...(storeId ? { storeId } : {}) },
      include: {
        client: true,
        motorcycle: true,
        order: true,
        approvedBy: true,
      },
    });
    if (!warranty) throw new NotFoundException('Garantía no encontrada');
    return warranty;
  }

  async create(tenantId: string, storeId: string | null, dto: CreateWarrantyDto) {
    if (!storeId) {
      throw new BadRequestException('Selecciona una sucursal específica para crear una garantía');
    }
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, tenantId, storeId },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');

    return this.prisma.warranty.create({
      data: {
        tenantId,
        storeId,
        orderId: order.id,
        motorcycleId: order.motorcycleId,
        clientId: order.clientId,
        reason: dto.reason,
        cost: dto.cost ?? 0,
        status: WarrantyStatus.OPEN,
      },
    });
  }

  async approve(tenantId: string, storeId: string | null, id: string, approvedById: string) {
    const warranty = await this.assertExists(tenantId, storeId, id);
    if (warranty.status !== WarrantyStatus.OPEN) {
      throw new BadRequestException('Esta garantía ya fue procesada');
    }
    return this.prisma.warranty.update({
      where: { id },
      data: { status: WarrantyStatus.APPROVED, approvedById },
    });
  }

  async reject(tenantId: string, storeId: string | null, id: string, approvedById: string) {
    const warranty = await this.assertExists(tenantId, storeId, id);
    if (warranty.status !== WarrantyStatus.OPEN) {
      throw new BadRequestException('Esta garantía ya fue procesada');
    }
    return this.prisma.warranty.update({
      where: { id },
      data: { status: WarrantyStatus.REJECTED, approvedById },
    });
  }

  async resolve(tenantId: string, storeId: string | null, id: string, dto: ResolveWarrantyDto) {
    const warranty = await this.assertExists(tenantId, storeId, id);
    if (warranty.status !== WarrantyStatus.APPROVED) {
      throw new BadRequestException(
        'Solo se pueden resolver garantías aprobadas',
      );
    }
    return this.prisma.warranty.update({
      where: { id },
      data: {
        status: WarrantyStatus.RESOLVED,
        result: dto.result,
        resolvedAt: new Date(),
      },
    });
  }

  private async assertExists(tenantId: string, storeId: string | null, id: string) {
    const warranty = await this.prisma.warranty.findFirst({
      where: { id, tenantId, ...(storeId ? { storeId } : {}) },
    });
    if (!warranty) throw new NotFoundException('Garantía no encontrada');
    return warranty;
  }
}
