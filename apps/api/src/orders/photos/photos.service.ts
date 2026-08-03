import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { OrdersService } from '../orders.service';
import { PhotoCategory, PhotoStage } from '../../generated/prisma/enums';

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
      orderBy: [{ stage: 'asc' }, { uploadedAt: 'desc' }],
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
    // Siempre WORK: las fotos de ingreso solo las crea el asistente de recepción,
    // dentro de la misma transacción que la orden. Que este endpoint pudiera
    // elegir el tipo permitiría inventar "fotos de ingreso" días después, que es
    // justo lo que este campo existe para impedir.
    return this.prisma.orderPhoto.create({
      data: {
        orderId,
        category: category || undefined,
        url,
        stage: PhotoStage.WORK,
      },
    });
  }

  async remove(tenantId: string, orderId: string, photoId: string) {
    await this.ordersService.assertOrderExists(tenantId, orderId);
    const photo = await this.prisma.orderPhoto.findFirst({
      where: { id: photoId, orderId },
    });
    if (!photo) throw new NotFoundException('Foto no encontrada');
    if (photo.stage === PhotoStage.INTAKE) {
      // El estado en que llegó el vehículo es evidencia frente al cliente; si se
      // pudiera borrar, la firma que respalda esa recepción quedaría sin sustento.
      throw new BadRequestException(
        'Las fotos de ingreso no se pueden eliminar: son el registro del estado en que se recibió el vehículo',
      );
    }
    return this.prisma.orderPhoto.delete({ where: { id: photoId } });
  }
}
