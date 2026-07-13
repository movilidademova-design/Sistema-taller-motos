import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('tenant-settings')
@Controller('tenant/settings')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  getSettings(@CurrentUser('tenantId') tenantId: string) {
    return this.tenantsService.getSettings(tenantId);
  }

  @Roles(Role.ADMIN)
  @Audit('Tenant')
  @Patch()
  updateSettings(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.updateSettings(tenantId, dto);
  }
}
