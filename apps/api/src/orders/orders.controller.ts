import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IMAGE_UPLOAD_OPTIONS } from '../common/upload/image-upload.options';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { IntakeOrderDto } from './dto/intake-order.dto';
import { DeliverOrderDto } from './dto/deliver-order.dto';
import { ExportOrdersQueryDto } from './dto/export-orders-query.dto';
import {
  EXCEL_CONTENT_TYPE,
  excelAttachment,
} from '../common/excel/excel.service';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Query() query: ListOrdersQueryDto,
  ) {
    // Every role sees every order in the current branch — a technician isn't
    // limited to orders explicitly assigned to them, since this shop doesn't
    // pre-assign a technician at intake; anyone can pick up and work an order.
    return this.ordersService.findAll(tenantId, { ...query, branchId });
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('export')
  async export(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('role') role: Role,
    @CurrentBranch() branchId: string,
    @Query() query: ExportOrdersQueryDto,
  ): Promise<StreamableFile> {
    const buffer = await this.ordersService.exportToExcel(
      tenantId,
      branchId,
      role,
      query,
    );
    return new StreamableFile(buffer, {
      type: EXCEL_CONTENT_TYPE,
      disposition: excelAttachment('ordenes'),
    });
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
      IMAGE_UPLOAD_OPTIONS,
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
