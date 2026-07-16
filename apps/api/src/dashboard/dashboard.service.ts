import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import {
  OrderStatus,
  WarrantyStatus,
  InventoryMovementType,
} from '../generated/prisma/enums';

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(tenantId: string, storeId: string | null) {
    const today = startOfDay();
    const todayEnd = endOfDay();
    const monthStart = startOfMonth();
    const storeWhere = storeId ? { storeId } : {};

    const [
      statusCounts,
      revenueToday,
      revenueMonth,
      newClientsThisMonth,
      deliveredThisMonth,
      activeWarranties,
      ordersCreatedToday,
      lowStockCount,
      expensesMonth,
      todaysAppointments,
    ] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { tenantId, ...storeWhere },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({
        where: { tenantId, ...storeWhere, createdAt: { gte: today } },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { tenantId, ...storeWhere, createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.client.count({
        where: { tenantId, ...storeWhere, createdAt: { gte: monthStart } },
      }),
      this.prisma.order.count({
        where: {
          tenantId,
          ...storeWhere,
          status: OrderStatus.DELIVERED,
          deliveredAt: { gte: monthStart },
        },
      }),
      this.prisma.warranty.count({
        where: {
          tenantId,
          ...storeWhere,
          status: { in: [WarrantyStatus.OPEN, WarrantyStatus.APPROVED] },
        },
      }),
      this.prisma.order.count({
        where: { tenantId, ...storeWhere, receivedAt: { gte: today } },
      }),
      this.countLowStock(tenantId, storeId),
      this.prisma.expense.aggregate({
        where: { tenantId, ...storeWhere, expenseDate: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.appointment.count({
        where: {
          tenantId,
          ...storeWhere,
          scheduledAt: { gte: today, lte: todayEnd },
          status: { in: ['SCHEDULED', 'CONFIRMED'] },
        },
      }),
    ]);

    const countFor = (status: OrderStatus) =>
      statusCounts.find((s) => s.status === status)?._count._all ?? 0;

    return {
      cards: {
        openOrders: statusCounts
          .filter(
            (s) =>
              !(
                [OrderStatus.DELIVERED, OrderStatus.CANCELLED] as OrderStatus[]
              ).includes(s.status),
          )
          .reduce((acc, s) => acc + s._count._all, 0),
        diagnosing: countFor(OrderStatus.DIAGNOSING),
        waitingApproval: countFor(OrderStatus.WAITING_APPROVAL),
        waitingParts: countFor(OrderStatus.WAITING_PARTS),
        inRepair: countFor(OrderStatus.IN_REPAIR),
        readyForDelivery: countFor(OrderStatus.READY_FOR_DELIVERY),
        deliveredThisMonth,
        revenueToday: Number(revenueToday._sum.amount ?? 0),
        revenueMonth: Number(revenueMonth._sum.amount ?? 0),
        newClientsThisMonth,
        activeWarranties,
        ordersCreatedToday,
        lowStockCount,
        expensesMonth: Number(expensesMonth._sum.amount ?? 0),
        todaysAppointments,
      },
    };
  }

  private async countLowStock(tenantId: string, storeId: string | null) {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) as count
      FROM products
      WHERE "tenantId" = ${tenantId}
        AND "isActive" = true
        AND "quantity" <= "minStock"
        ${storeId ? Prisma.sql`AND "storeId" = ${storeId}` : Prisma.empty}
    `;
    return Number(rows[0]?.count ?? 0);
  }

  async getRevenueChart(tenantId: string, storeId: string | null, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const rows = await this.prisma.$queryRaw<{ day: Date; total: string }[]>`
      SELECT date_trunc('day', "createdAt") as day, SUM(amount) as total
      FROM payments
      WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${since}
        ${storeId ? Prisma.sql`AND "storeId" = ${storeId}` : Prisma.empty}
      GROUP BY day
      ORDER BY day ASC
    `;
    return rows.map((r) => ({ date: r.day, total: Number(r.total) }));
  }

  async getOrdersPerDayChart(tenantId: string, storeId: string | null, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const rows = await this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") as day, COUNT(*) as count
      FROM orders
      WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${since}
        ${storeId ? Prisma.sql`AND "storeId" = ${storeId}` : Prisma.empty}
      GROUP BY day
      ORDER BY day ASC
    `;
    return rows.map((r) => ({ date: r.day, count: Number(r.count) }));
  }

  async getFrequentFaults(tenantId: string, storeId: string | null, limit = 10) {
    const rows = await this.prisma.$queryRaw<
      { faultFound: string; count: bigint }[]
    >`
      SELECT d."faultFound", COUNT(*) as count
      FROM diagnoses d
      JOIN orders o ON o.id = d."orderId"
      WHERE o."tenantId" = ${tenantId}
        ${storeId ? Prisma.sql`AND o."storeId" = ${storeId}` : Prisma.empty}
      GROUP BY d."faultFound"
      ORDER BY count DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({ fault: r.faultFound, count: Number(r.count) }));
  }

  async getPartsUsage(tenantId: string, storeId: string | null, limit = 10) {
    const rows = await this.prisma.inventoryMovement.groupBy({
      by: ['productId'],
      where: { tenantId, ...(storeId ? { storeId } : {}), type: InventoryMovementType.SALE_OUT },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });
    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.productId) } },
      select: { id: true, name: true, sku: true },
    });
    return rows.map((r) => ({
      product: products.find((p) => p.id === r.productId),
      quantity: r._sum.quantity ?? 0,
    }));
  }

  async getTechnicianProductivity(tenantId: string, storeId: string | null) {
    const technicians = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: 'TECHNICIAN',
        ...(storeId ? { storeMemberships: { some: { storeId } } } : {}),
      },
      select: { id: true, firstName: true, lastName: true },
    });

    const results = await Promise.all(
      technicians.map(async (tech) => {
        const [laborAgg, deliveredCount] = await Promise.all([
          this.prisma.laborEntry.aggregate({
            where: { technicianId: tech.id },
            _sum: { hours: true, cost: true },
          }),
          this.prisma.order.count({
            where: {
              tenantId,
              ...(storeId ? { storeId } : {}),
              technicianId: tech.id,
              status: OrderStatus.DELIVERED,
            },
          }),
        ]);
        return {
          technician: tech,
          totalHours: Number(laborAgg._sum.hours ?? 0),
          totalCost: Number(laborAgg._sum.cost ?? 0),
          ordersDelivered: deliveredCount,
        };
      }),
    );

    return results;
  }
}
