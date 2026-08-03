import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PhotosService } from './photos/photos.service';
import { PhotosController } from './photos/photos.controller';
import { DiagnosisService } from './diagnosis/diagnosis.service';
import { DiagnosisController } from './diagnosis/diagnosis.controller';
import { QuotationsService } from './quotations/quotations.service';
import { QuotationsController } from './quotations/quotations.controller';

@Module({
  imports: [RealtimeModule, NotificationsModule, StorageModule],
  controllers: [
    OrdersController,
    PhotosController,
    DiagnosisController,
    QuotationsController,
  ],
  providers: [
    OrdersService,
    PhotosService,
    DiagnosisService,
    QuotationsService,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
