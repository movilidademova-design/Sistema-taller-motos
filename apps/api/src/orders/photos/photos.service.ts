import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { OrdersService } from '../orders.service';
import { PhotoCategory } from '../../generated/prisma/enums';

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ordersService: OrdersService,
  ) {}

  async findAll(tenantId: string, orderId: string) {
    await this.ordersService.assertOrderExists(tenantId, orderId);
    return this.prisma.orderPhoto.findMany({
      where: { orderId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async upload(
    tenantId: string,
    orderId: string,
    category: PhotoCategory | undefined,
    file: Express.Multer.File,
  ) {
    await this.ordersService.assertOrderExists(tenantId, orderId);
    const url = await this.storage.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      'orders',
    );
    return this.prisma.orderPhoto.create({
      data: { orderId, category: category || undefined, url },
    });
  }

  async remove(tenantId: string, orderId: string, photoId: string) {
    await this.ordersService.assertOrderExists(tenantId, orderId);
    return this.prisma.orderPhoto.delete({ where: { id: photoId } });
  }
}
