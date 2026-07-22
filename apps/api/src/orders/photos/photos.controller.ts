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
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { PhotoCategory, Role } from '../../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('orders/:orderId/photos')
export class PhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.photosService.findAll(tenantId, orderId);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TECHNICIAN)
  @Audit('OrderPhoto')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @Post()
  upload(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
    @Body('category') category: PhotoCategory | undefined,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.photosService.upload(tenantId, orderId, category, file);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TECHNICIAN)
  @Audit('OrderPhoto')
  @Delete(':photoId')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
    @Param('photoId') photoId: string,
  ) {
    return this.photosService.remove(tenantId, orderId, photoId);
  }
}
