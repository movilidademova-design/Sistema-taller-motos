import { Module } from '@nestjs/common';
import { CategoriesService } from './categories/categories.service';
import { CategoriesController } from './categories/categories.controller';
import { SuppliersService } from './suppliers/suppliers.service';
import { SuppliersController } from './suppliers/suppliers.controller';
import { ProductsService } from './products/products.service';
import { ProductsController } from './products/products.controller';
import { MovementsService } from './movements/movements.service';
import { MovementsController } from './movements/movements.controller';

@Module({
  controllers: [
    CategoriesController,
    SuppliersController,
    ProductsController,
    MovementsController,
  ],
  providers: [
    CategoriesService,
    SuppliersService,
    ProductsService,
    MovementsService,
  ],
  exports: [ProductsService, SuppliersService, CategoriesService],
})
export class InventoryModule {}
