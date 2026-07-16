import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@ApiBearerAuth()
@ApiTags('expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @RequirePermission('reports.view', 'expenses.manage')
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.expensesService.findAll(tenantId, storeId, from, to);
  }

  @RequirePermission('reports.view', 'expenses.manage')
  @Get(':id')
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.expensesService.findOne(tenantId, storeId, id);
  }

  @RequirePermission('expenses.manage')
  @Audit('Expense')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentStore() storeId: string | null,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expensesService.create(tenantId, storeId, userId, dto);
  }

  @RequirePermission('expenses.manage')
  @Audit('Expense')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(tenantId, storeId, id, dto);
  }

  @RequirePermission('expenses.manage')
  @Audit('Expense')
  @Delete(':id')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.expensesService.remove(tenantId, storeId, id);
  }
}
