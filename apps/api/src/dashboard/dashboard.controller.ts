import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(@CurrentUser('tenantId') tenantId: string) {
    return this.dashboardService.getSummary(tenantId);
  }

  @Get('charts/revenue')
  getRevenueChart(
    @CurrentUser('tenantId') tenantId: string,
    @Query('days') days?: number,
  ) {
    return this.dashboardService.getRevenueChart(
      tenantId,
      days ? Number(days) : undefined,
    );
  }

  @Get('charts/orders-per-day')
  getOrdersPerDay(
    @CurrentUser('tenantId') tenantId: string,
    @Query('days') days?: number,
  ) {
    return this.dashboardService.getOrdersPerDayChart(
      tenantId,
      days ? Number(days) : undefined,
    );
  }

  @Get('charts/frequent-faults')
  getFrequentFaults(@CurrentUser('tenantId') tenantId: string) {
    return this.dashboardService.getFrequentFaults(tenantId);
  }

  @Get('charts/parts-usage')
  getPartsUsage(@CurrentUser('tenantId') tenantId: string) {
    return this.dashboardService.getPartsUsage(tenantId);
  }

  @Get('charts/technician-productivity')
  getTechnicianProductivity(@CurrentUser('tenantId') tenantId: string) {
    return this.dashboardService.getTechnicianProductivity(tenantId);
  }
}
