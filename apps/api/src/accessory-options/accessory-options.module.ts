import { Module } from '@nestjs/common';
import { AccessoryOptionsService } from './accessory-options.service';
import { AccessoryOptionsController } from './accessory-options.controller';

@Module({
  controllers: [AccessoryOptionsController],
  providers: [AccessoryOptionsService],
  exports: [AccessoryOptionsService],
})
export class AccessoryOptionsModule {}
