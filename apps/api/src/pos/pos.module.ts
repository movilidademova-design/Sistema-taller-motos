import { Global, Module } from '@nestjs/common';
import { PosPrismaService } from './pos-prisma.service';
import { PosProductsController } from './products/products.controller';
import { PosProductsService } from './products/products.service';
import { PosListsController } from './lists/lists.controller';
import { PosListsService } from './lists/lists.service';
import { PosSalesController } from './sales/sales.controller';
import { PosSalesService } from './sales/sales.service';

@Global()
@Module({
  controllers: [PosProductsController, PosListsController, PosSalesController],
  providers: [
    PosPrismaService,
    PosProductsService,
    PosListsService,
    PosSalesService,
  ],
  exports: [PosPrismaService],
})
export class PosModule {}
