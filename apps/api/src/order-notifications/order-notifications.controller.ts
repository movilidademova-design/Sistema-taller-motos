import { Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrderNotificationsService } from './order-notifications.service';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@ApiBearerAuth()
@ApiTags('order-notifications')
@RequirePermission('notifications.send')
@Controller('order-notifications')
export class OrderNotificationsController {
  constructor(private readonly notifications: OrderNotificationsService) {}

  @Get()
  findPending(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
  ) {
    return this.notifications.findPending(tenantId, storeId);
  }

  @Audit('OrderNotification')
  @Patch(':id/mark-notified')
  markNotified(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.notifications.markNotified(tenantId, storeId, id, userId);
  }

  @Audit('OrderNotification')
  @Post(':id/send-email')
  sendEmail(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.notifications.sendEmailAndMarkNotified(tenantId, storeId, id, userId);
  }
}
