import { Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrderNotificationsService } from './order-notifications.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

// TODO: sumar Role.CASHIER a este @Roles cuando ese rol exista en el sistema
// (el usuario confirmó que "Cajero" se usará, pero el rediseño de roles queda
// para un siguiente ajuste — por ahora Admin y Recepción cubren este flujo).
const NOTIFICATION_MANAGERS = [Role.ADMIN, Role.RECEPTIONIST] as const;

@ApiBearerAuth()
@ApiTags('order-notifications')
@Roles(...NOTIFICATION_MANAGERS)
@Controller('order-notifications')
export class OrderNotificationsController {
  constructor(private readonly notifications: OrderNotificationsService) {}

  @Get()
  findPending(@CurrentUser('tenantId') tenantId: string) {
    return this.notifications.findPending(tenantId);
  }

  @Audit('OrderNotification')
  @Patch(':id/mark-notified')
  markNotified(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.notifications.markNotified(tenantId, id, userId);
  }

  @Audit('OrderNotification')
  @Post(':id/send-email')
  sendEmail(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.notifications.sendEmailAndMarkNotified(tenantId, id, userId);
  }
}
