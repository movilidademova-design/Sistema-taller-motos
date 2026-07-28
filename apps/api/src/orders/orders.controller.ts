import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { IntakeOrderDto } from './dto/intake-order.dto';
import { DeliverOrderDto } from './dto/deliver-order.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { OrderStatus, Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role,
    @CurrentBranch() branchId: string,
    @Query()
    query: PaginationQueryDto & {
      status?: OrderStatus;
      technicianId?: string;
      clientId?: string;
    },
  ) {
    // Technicians only ever see orders assigned to them.
    const scoped =
      role === Role.TECHNICIAN
        ? { ...query, technicianId: userId, branchId }
        : { ...query, branchId };
    return this.ordersService.findAll(tenantId, scoped);
  }

  @Get(':id')
  findOne(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.ordersService.findOne(tenantId, id);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Order')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentBranch() branchId: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create(tenantId, branchId, userId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Order')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'photos', maxCount: 10 },
        { name: 'signature', maxCount: 1 },
      ],
      {
        limits: { fileSize: 8 * 1024 * 1024 },
        fileFilter: (_req, file, callback) => {
          if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
            callback(
              new BadRequestException('Solo se permiten imágenes JPEG, PNG o WEBP'),
              false,
            );
            return;
          }
          callback(null, true);
        },
      },
    ),
  )
  @Post('intake')
  intake(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentBranch() branchId: string,
    @Body() dto: IntakeOrderDto,
    @UploadedFiles()
    files: {
      photos?: Express.Multer.File[];
      signature?: Express.Multer.File[];
    },
  ) {
    return this.ordersService.intake(tenantId, branchId, userId, dto, files);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Order')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.ordersService.update(tenantId, id, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TECHNICIAN)
  @Audit('Order')
  @Patch(':id/status')
  updateStatus(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(tenantId, id, userId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Order')
  @Post(':id/deliver')
  deliver(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: DeliverOrderDto,
  ) {
    return this.ordersService.deliver(tenantId, id, userId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Post(':id/send-intake-message')
  sendIntakeMessage(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.ordersService.sendIntakeConfirmationEmail(tenantId, id);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TECHNICIAN)
  @Audit('Notification')
  @Post(':id/notify')
  notify(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.ordersService.notify(tenantId, id, userId);
  }
}
