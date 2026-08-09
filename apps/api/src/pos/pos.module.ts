import { Global, Module } from '@nestjs/common';
import { PosPrismaService } from './pos-prisma.service';

@Global()
@Module({
  providers: [PosPrismaService],
  exports: [PosPrismaService],
})
export class PosModule {}
