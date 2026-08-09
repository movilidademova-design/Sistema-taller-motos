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
import { PosReportsController } from './reports/reports.controller';
import { PosReportsService } from './reports/reports.service';

@Global()
@Module({
  controllers: [
    PosProductsController,
    PosListsController,
    PosSalesController,
    PosLayawaysController,
    PosReportsController,
  ],
  providers: [
    PosPrismaService,
    PosProductsService,
    PosListsService,
    PosSalesService,
    PosLayawaysService,
    PosReportsService,
  ],
  exports: [PosPrismaService],
})
export class PosModule {}
