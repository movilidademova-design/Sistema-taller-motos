import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { PhotosService } from './photos.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { PhotoCategory } from '../../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('orders/:orderId/photos')
export class PhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('orderId') orderId: string,
  ) {
    return this.photosService.findAll(tenantId, storeId, orderId);
  }

  @RequirePermission('orders.documentation')
  @Audit('OrderPhoto')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @Post()
  upload(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('orderId') orderId: string,
    @Body('category') category: PhotoCategory,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.photosService.upload(tenantId, storeId, orderId, category, file);
  }

  @RequirePermission('orders.documentation')
  @Audit('OrderPhoto')
  @Delete(':photoId')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('orderId') orderId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.photosService.remove(tenantId, storeId, orderId, photoId);
  }
}
