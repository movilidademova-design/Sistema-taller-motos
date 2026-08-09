import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PosListsService } from './lists.service';
import { CreatePosListDto, ListPosListsQueryDto } from './dto/list.dto';
import { PosRoles } from '../../common/decorators/pos-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { PosRole } from '../../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('pos')
@Controller('pos/lists')
export class PosListsController {
  constructor(private readonly listsService: PosListsService) {}

  @PosRoles(PosRole.ADMIN, PosRole.CASHIER)
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Query() query: ListPosListsQueryDto,
  ) {
    return this.listsService.findAll(tenantId, branchId, query.type);
  }

  @PosRoles(PosRole.ADMIN)
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Body() dto: CreatePosListDto,
  ) {
    return this.listsService.create(tenantId, branchId, dto);
  }

  @PosRoles(PosRole.ADMIN)
  @Delete(':id')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Param('id') id: string,
  ) {
    return this.listsService.remove(tenantId, branchId, id);
  }
}
