import { Module } from '@nestjs/common';
import { QuickServicesService } from './quick-services.service';
import { QuickServicesController } from './quick-services.controller';

@Module({
  controllers: [QuickServicesController],
  providers: [QuickServicesService],
  exports: [QuickServicesService],
})
export class QuickServicesModule {}
