import { Module } from '@nestjs/common';
import { SortableCatalogService } from './sortable-catalog.service';
import { QuickServicesController } from './quick-services/quick-services.controller';
import { AccessoryOptionsController } from './accessory-options/accessory-options.controller';

@Module({
  controllers: [QuickServicesController, AccessoryOptionsController],
  providers: [SortableCatalogService],
  exports: [SortableCatalogService],
})
export class CatalogsModule {}
