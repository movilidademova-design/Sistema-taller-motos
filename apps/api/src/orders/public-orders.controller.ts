import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { Public } from '../common/decorators/public.decorator';

/**
 * Enlace público de seguimiento: sin login, sin exponer clave de salida ni
 * datos sensibles del cliente. Montado aparte de OrdersController para que
 * quede claro en las rutas cuáles exigen autenticación y cuáles no.
 */
@ApiTags('public')
@Public()
@Controller('public/orders')
export class PublicOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('track/:trackingToken')
  track(@Param('trackingToken') trackingToken: string) {
    return this.ordersService.findByTrackingToken(trackingToken);
  }
}
