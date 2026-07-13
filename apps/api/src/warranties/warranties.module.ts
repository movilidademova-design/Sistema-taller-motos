import { Module } from '@nestjs/common';
import { WarrantiesService } from './warranties.service';
import { WarrantiesController } from './warranties.controller';

@Module({
  providers: [WarrantiesService],
  controllers: [WarrantiesController],
})
export class WarrantiesModule {}
