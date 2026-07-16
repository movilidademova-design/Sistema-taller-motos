import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentStore } from '../common/decorators/current-store.decorator';

@ApiBearerAuth()
@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
  ) {
    return this.dashboardService.getSummary(tenantId, storeId);
  }

  @Get('charts/revenue')
  getRevenueChart(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Query('days') days?: number,
  ) {
    return this.dashboardService.getRevenueChart(
      tenantId,
      storeId,
      days ? Number(days) : undefined,
    );
  }

  @Get('charts/orders-per-day')
  getOrdersPerDay(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Query('days') days?: number,
  ) {
    return this.dashboardService.getOrdersPerDayChart(
      tenantId,
      storeId,
      days ? Number(days) : undefined,
    );
  }

  @Get('charts/frequent-faults')
  getFrequentFaults(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
  ) {
    return this.dashboardService.getFrequentFaults(tenantId, storeId);
  }

  @Get('charts/parts-usage')
  getPartsUsage(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
  ) {
    return this.dashboardService.getPartsUsage(tenantId, storeId);
  }

  @Get('charts/technician-productivity')
  getTechnicianProductivity(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
  ) {
    return this.dashboardService.getTechnicianProductivity(tenantId, storeId);
  }
}
