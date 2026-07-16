import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders.service';
import { SetChecklistDto } from './dto/set-checklist.dto';

@Injectable()
export class ChecklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  async findAll(tenantId: string, storeId: string | null, orderId: string) {
    await this.ordersService.assertOrderExists(tenantId, storeId, orderId);
    return this.prisma.checklistItem.findMany({ where: { orderId } });
  }

  async setItems(
    tenantId: string,
    storeId: string | null,
    orderId: string,
    dto: SetChecklistDto,
  ) {
    await this.ordersService.assertOrderExists(tenantId, storeId, orderId);

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.checklistItem.upsert({
          where: { orderId_item: { orderId, item: item.item } },
          create: { orderId, ...item },
          update: {
            condition: item.condition,
            observations: item.observations,
          },
        }),
      ),
    );

    return this.findAll(tenantId, storeId, orderId);
  }
}
