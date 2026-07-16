import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../notifications/email.service';
import { OrderStatus } from '../generated/prisma/enums';

@Injectable()
export class OrderNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  findPending(tenantId: string, storeId: string | null) {
    return this.prisma.orderNotification.findMany({
      where: {
        tenantId,
        isNotified: false,
        ...(storeId ? { order: { storeId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            client: {
              select: { firstName: true, lastName: true, phone: true, email: true },
            },
          },
        },
      },
    });
  }

  create(
    tenantId: string,
    orderId: string,
    status: OrderStatus,
    message: string,
    createdById: string,
  ) {
    return this.prisma.orderNotification.create({
      data: { tenantId, orderId, status, message, createdById },
    });
  }

  async markNotified(tenantId: string, storeId: string | null, id: string, userId: string) {
    await this.assertExists(tenantId, storeId, id);
    return this.prisma.orderNotification.update({
      where: { id },
      data: { isNotified: true, notifiedAt: new Date(), notifiedById: userId },
    });
  }

  async sendEmailAndMarkNotified(
    tenantId: string,
    storeId: string | null,
    id: string,
    userId: string,
  ) {
    const notification = await this.prisma.orderNotification.findFirst({
      where: { id, tenantId, ...(storeId ? { order: { storeId } } : {}) },
      include: {
        order: { include: { client: { select: { email: true } } } },
      },
    });
    if (!notification) throw new NotFoundException('Notificación no encontrada');
    if (!notification.order.client.email) {
      throw new BadRequestException('El cliente no tiene correo registrado');
    }

    await this.email.send({
      to: notification.order.client.email,
      subject: `Actualización de tu orden #${notification.order.orderNumber}`,
      html: notification.message.replace(/\n/g, '<br/>'),
    });

    return this.prisma.orderNotification.update({
      where: { id },
      data: { isNotified: true, notifiedAt: new Date(), notifiedById: userId },
    });
  }

  private async assertExists(tenantId: string, storeId: string | null, id: string) {
    const notification = await this.prisma.orderNotification.findFirst({
      where: { id, tenantId, ...(storeId ? { order: { storeId } } : {}) },
    });
    if (!notification) throw new NotFoundException('Notificación no encontrada');
    return notification;
  }
}
