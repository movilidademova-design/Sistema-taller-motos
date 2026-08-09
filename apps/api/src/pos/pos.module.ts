import { Global, Module } from '@nestjs/common';
import { PosPrismaService } from './pos-prisma.service';
import { PosProductsController } from './products/products.controller';
import { PosProductsService } from './products/products.service';
import { PosListsController } from './lists/lists.controller';
import { PosListsService } from './lists/lists.service';
import { PosSalesController } from './sales/sales.controller';
import { PosSalesService } from './sales/sales.service';
import { PosLayawaysController } from './layaways/layaways.controller';
import { PosLayawaysService } from './layaways/layaways.service';

@Global()
@Module({
  controllers: [
    PosProductsController,
    PosListsController,
    PosSalesController,
    PosLayawaysController,
  ],
  providers: [
    PosPrismaService,
    PosProductsService,
    PosListsService,
    PosSalesService,
    PosLayawaysService,
  ],
  exports: [PosPrismaService],
})
export class PosModule {}
