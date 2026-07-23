import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../notifications/email.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { MarkNotificationSentDto } from './dto/mark-notification-sent.dto';
import { NotificationStatus } from '../generated/prisma/enums';

const NOTIFICATION_LIST_INCLUDE = {
  order: {
    select: {
      orderNumber: true,
      client: {
        select: { firstName: true, lastName: true, phone: true, email: true },
      },
    },
  },
  createdBy: { select: { firstName: true, lastName: true } },
  sentBy: { select: { firstName: true, lastName: true } },
} as const;

@Injectable()
export class NotificationInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async findAll(tenantId: string, query: ListNotificationsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: NOTIFICATION_LIST_INCLUDE,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async sendEmail(tenantId: string, id: string, userId: string) {
    const notification = await this.assertExists(tenantId, id);
    const email = notification.order.client.email;
    if (!email) {
      throw new BadRequestException('El cliente no tiene correo registrado');
    }
    await this.email.sendNotificationMessage(
      email,
      notification.order.orderNumber,
      notification.message,
    );
    return this.markSentInternal(id, userId, 'EMAIL');
  }

  async markSent(tenantId: string, id: string, userId: string, dto: MarkNotificationSentDto) {
    await this.assertExists(tenantId, id);
    return this.markSentInternal(id, userId, dto.channel);
  }

  private async markSentInternal(
    id: string,
    userId: string,
    channel: 'WHATSAPP' | 'EMAIL' | 'COPY',
  ) {
    return this.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        sentById: userId,
        sentVia: channel,
      },
      include: NOTIFICATION_LIST_INCLUDE,
    });
  }

  private async assertExists(tenantId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, tenantId },
      include: NOTIFICATION_LIST_INCLUDE,
    });
    if (!notification) throw new NotFoundException('Notificación no encontrada');
    if (notification.status === NotificationStatus.SENT) {
      throw new BadRequestException('Esta notificación ya fue enviada');
    }
    return notification;
  }
}
