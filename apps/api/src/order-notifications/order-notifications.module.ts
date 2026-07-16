import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrderNotificationsService } from './order-notifications.service';
import { OrderNotificationsController } from './order-notifications.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [OrderNotificationsController],
  providers: [OrderNotificationsService],
  exports: [OrderNotificationsService],
})
export class OrderNotificationsModule {}
