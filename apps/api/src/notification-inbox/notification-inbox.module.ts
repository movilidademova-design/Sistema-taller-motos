import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationInboxController } from './notification-inbox.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [NotificationInboxController],
  providers: [NotificationInboxService],
})
export class NotificationInboxModule {}
