import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationInboxService } from './notification-inbox.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { MarkNotificationSentDto } from './dto/mark-notification-sent.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('notifications')
@Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
@Controller('notifications')
export class NotificationInboxController {
  constructor(private readonly notificationInboxService: NotificationInboxService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationInboxService.findAll(tenantId, branchId, query);
  }

  @Audit('Notification')
  @HttpCode(HttpStatus.OK)
  @Post(':id/send-email')
  sendEmail(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.notificationInboxService.sendEmail(tenantId, id, userId);
  }

  @Audit('Notification')
  @HttpCode(HttpStatus.OK)
  @Post(':id/mark-sent')
  markSent(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: MarkNotificationSentDto,
  ) {
    return this.notificationInboxService.markSent(tenantId, id, userId, dto);
  }
}
