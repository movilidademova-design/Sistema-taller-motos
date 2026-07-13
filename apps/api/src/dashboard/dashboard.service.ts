import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(tenantId: string) {
    const today = startOfDay();
    const monthStart = startOfMonth();

    const [
      statusCounts,
      revenueToday,
      revenueMonth,
      newClientsThisMonth,
      deliveredThisMonth,
      activeWarranties,
    ] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({
        where: { tenantId, createdAt: { gte: today } },
        _sum: { amount: true },
      }),
      this.prisma.payment.aggregate({
        where: { tenantId, createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      this.prisma.client.count({
        where: { tenantId, createdAt: { gte: monthStart } },
      }),
      this.prisma.order.count({
        where: {
          tenantId,
          status: OrderStatus.DELIVERED,
          deliveredAt: { gte: monthStart },
        },
      }),
      this.prisma.warranty.count({
        where: {
          tenantId,
          status: { in: [WarrantyStatus.OPEN, WarrantyStatus.APPROVED] },
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
      },
    };
  }

  async getRevenueChart(tenantId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const rows = await this.prisma.$queryRaw<{ day: Date; total: string }[]>`
      SELECT date_trunc('day', "createdAt") as day, SUM(amount) as total
      FROM payments
      WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `;
    return rows.map((r) => ({ date: r.day, total: Number(r.total) }));
  }

  async getOrdersPerDayChart(tenantId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const rows = await this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
      SELECT date_trunc('day', "createdAt") as day, COUNT(*) as count
      FROM orders
      WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${since}
      GROUP BY day
      ORDER BY day ASC
    `;
    return rows.map((r) => ({ date: r.day, count: Number(r.count) }));
  }

  async getFrequentFaults(tenantId: string, limit = 10) {
    const rows = await this.prisma.$queryRaw<
      { faultFound: string; count: bigint }[]
    >`
      SELECT d."faultFound", COUNT(*) as count
      FROM diagnoses d
      JOIN orders o ON o.id = d."orderId"
      WHERE o."tenantId" = ${tenantId}
      GROUP BY d."faultFound"
      ORDER BY count DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({ fault: r.faultFound, count: Number(r.count) }));
  }

  async getPartsUsage(tenantId: string, limit = 10) {
    const rows = await this.prisma.inventoryMovement.groupBy({
      by: ['productId'],
      where: { tenantId, type: InventoryMovementType.SALE_OUT },
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

  async getTechnicianProductivity(tenantId: string) {
    const technicians = await this.prisma.user.findMany({
      where: { tenantId, role: 'TECHNICIAN' },
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
