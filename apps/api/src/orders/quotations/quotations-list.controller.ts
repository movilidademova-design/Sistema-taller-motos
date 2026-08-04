import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QuotationsService } from './quotations.service';
import { ListQuotationsQueryDto } from './dto/list-quotations-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { Role } from '../../generated/prisma/enums';

/**
 * Lista de cotizaciones para la sección propia del menú, con alcance por
 * sucursal. Distinto de `QuotationsController` (montado en
 * `orders/:orderId/quotation`), que sigue siendo el único lugar donde se
 * edita, genera el PDF, envía o cambia de estado una cotización.
 */
@ApiBearerAuth()
@ApiTags('quotations')
@Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
@Controller('quotations')
export class QuotationsListController {
  constructor(private readonly quotationsService: QuotationsService) {}

  // Declarada antes de cualquier ruta con :param, por convención del repo.
  @Get('pending-count')
  pendingCount(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
  ) {
    return this.quotationsService.pendingCount(tenantId, branchId);
  }

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Query() query: ListQuotationsQueryDto,
  ) {
    return this.quotationsService.findAllForBranch(
      tenantId,
      branchId,
      query.status,
    );
  }
}
