import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('audit')
@Roles(Role.ADMIN, Role.MANAGER)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query()
    query: {
      page?: number;
      pageSize?: number;
      entity?: string;
      entityId?: string;
      userId?: string;
    },
  ) {
    return this.auditService.findAll(tenantId, query);
  }
}
