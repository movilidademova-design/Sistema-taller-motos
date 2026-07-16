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
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CreateOrderIntakeDto } from './dto/create-order-intake.dto';
import { NotifyOrderDto } from './dto/notify-order.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentStore } from '../common/decorators/current-store.decorator';
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
    @CurrentStore() storeId: string | null,
    @Query()
    query: PaginationQueryDto & {
      status?: OrderStatus;
      technicianId?: string;
      clientId?: string;
    },
  ) {
    // Technicians only ever see orders assigned to them.
    const scoped =
      role === Role.TECHNICIAN ? { ...query, technicianId: userId } : query;
    return this.ordersService.findAll(tenantId, storeId, scoped);
  }

  @Get('search')
  search(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Query('orderNumber') orderNumber: string,
  ) {
    return this.ordersService.searchByOrderNumber(tenantId, storeId, Number(orderNumber));
  }

  @Get(':id')
  async findOne(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('role') role: Role,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    const order = await this.ordersService.findOne(tenantId, storeId, id);
    // La clave de salida solo la deben ver quienes entregan el vehículo.
    if (role === Role.TECHNICIAN) {
      const { exitCode: _exitCode, ...rest } = order;
      return rest;
    }
    return order;
  }

  @RequirePermission('orders.create')
  @Audit('Order')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentStore() storeId: string | null,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create(tenantId, storeId, userId, dto);
  }

  @RequirePermission('orders.create')
  @Audit('Order')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'photos', maxCount: 10 },
      { name: 'signature', maxCount: 1 },
    ]),
  )
  @Post('intake')
  async createIntake(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentStore() storeId: string | null,
    @Body('payload') payloadJson: string,
    @UploadedFiles()
    files: {
      photos?: Express.Multer.File[];
      signature?: Express.Multer.File[];
    },
  ) {
    const dto = await this.parseIntakePayload(payloadJson);
    return this.ordersService.createIntake(
      tenantId,
      storeId,
      userId,
      dto,
      files?.photos ?? [],
      files?.signature?.[0],
    );
  }

  @RequirePermission('notifications.send')
  @Post(':id/notify')
  notify(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
    @Body() dto: NotifyOrderDto,
  ) {
    return this.ordersService.notify(tenantId, storeId, id, dto.channel);
  }

  /**
   * El payload llega como un campo de texto JSON dentro del multipart/form-data
   * (junto a los archivos) porque el ValidationPipe global no interpreta JSON
   * anidado dentro de multipart — se parsea y valida a mano aquí.
   */
  private async parseIntakePayload(
    payloadJson: string,
  ): Promise<CreateOrderIntakeDto> {
    let raw: unknown;
    try {
      raw = JSON.parse(payloadJson ?? '');
    } catch {
      throw new BadRequestException('El campo payload debe ser JSON válido');
    }
    const dto = plainToInstance(CreateOrderIntakeDto, raw);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      throw new BadRequestException(
        errors.flatMap((e) => Object.values(e.constraints ?? {})),
      );
    }
    return dto;
  }

  @RequirePermission('orders.update')
  @Audit('Order')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.ordersService.update(tenantId, storeId, id, dto);
  }

  @RequirePermission('orders.changeStatus')
  @Audit('Order')
  @Patch(':id/status')
  updateStatus(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(tenantId, storeId, id, userId, dto);
  }

  /**
   * Se llama después de un PATCH .../status exitoso, cuando el usuario que
   * cambió el estado responde "Sí" a "¿Desea generar una notificación para
   * el cliente?" — crea la notificación interna pendiente, no envía nada
   * directamente al cliente.
   */
  @RequirePermission('orders.changeStatus')
  @Audit('OrderNotification')
  @Post(':id/notifications')
  requestClientNotification(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.ordersService.requestClientNotification(tenantId, storeId, id, userId);
  }
}
