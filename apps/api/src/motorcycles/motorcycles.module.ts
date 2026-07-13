import { Module } from '@nestjs/common';
import { MotorcyclesService } from './motorcycles.service';
import { MotorcyclesController } from './motorcycles.controller';

@Module({
  providers: [MotorcyclesService],
  controllers: [MotorcyclesController],
  exports: [MotorcyclesService],
})
export class MotorcyclesModule {}
