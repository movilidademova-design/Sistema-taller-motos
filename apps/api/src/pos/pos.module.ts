import { Global, Module } from '@nestjs/common';
import { PosPrismaService } from './pos-prisma.service';
import { PosProductsController } from './products/products.controller';
import { PosProductsService } from './products/products.service';
import { PosListsController } from './lists/lists.controller';
import { PosListsService } from './lists/lists.service';

@Global()
@Module({
  controllers: [PosProductsController, PosListsController],
  providers: [PosPrismaService, PosProductsService, PosListsService],
  exports: [PosPrismaService],
})
export class PosModule {}
