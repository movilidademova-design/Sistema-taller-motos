'use client';

import {
  ClipboardList,
  Wrench,
  Clock,
  PackageSearch,
  Hammer,
  PackageCheck,
  CircleDollarSign,
  UserPlus,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { useApiSWR } from '@/hooks/use-api-swr';
import { StatCard } from '@/components/dashboard/stat-card';
import { RevenueAreaChart, OrdersPerDayChart, HorizontalBarChart } from '@/components/dashboard/charts';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardSummary } from '@/lib/types';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    value,
  );
}

export default function DashboardPage() {
  const { data: summary, isLoading } = useApiSWR<DashboardSummary>('/dashboard/summary');
  const { data: revenue } = useApiSWR<{ date: string; total: number }[]>('/dashboard/charts/revenue');
  const { data: ordersPerDay } = useApiSWR<{ date: string; count: number }[]>(
    '/dashboard/charts/orders-per-day',
  );
  const { data: faults } = useApiSWR<{ fault: string; count: number }[]>('/dashboard/charts/frequent-faults');
  const { data: partsUsage } = useApiSWR<{ product?: { name: string }; quantity: number }[]>(
    '/dashboard/charts/parts-usage',
  );

  const cards = summary?.cards;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Panel</h1>
        <p className="text-sm text-muted-foreground">Resumen general del taller en tiempo real</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Órdenes abiertas" value={cards?.openOrders ?? 0} icon={ClipboardList} />
          <StatCard label="En diagnóstico" value={cards?.diagnosing ?? 0} icon={Wrench} />
          <StatCard label="Esperando aprobación" value={cards?.waitingApproval ?? 0} icon={Clock} accent="warning" />
          <StatCard label="Esperando repuestos" value={cards?.waitingParts ?? 0} icon={PackageSearch} accent="warning" />
          <StatCard label="En reparación" value={cards?.inRepair ?? 0} icon={Hammer} />
          <StatCard label="Listas para entrega" value={cards?.readyForDelivery ?? 0} icon={PackageCheck} accent="success" />
          <StatCard label="Entregadas este mes" value={cards?.deliveredThisMonth ?? 0} icon={Truck} accent="success" />
          <StatCard label="Facturación del día" value={formatCurrency(cards?.revenueToday ?? 0)} icon={CircleDollarSign} accent="success" />
          <StatCard label="Facturación del mes" value={formatCurrency(cards?.revenueMonth ?? 0)} icon={CircleDollarSign} accent="success" />
          <StatCard label="Clientes nuevos" value={cards?.newClientsThisMonth ?? 0} icon={UserPlus} />
          <StatCard label="Garantías activas" value={cards?.activeWarranties ?? 0} icon={ShieldCheck} accent="warning" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <RevenueAreaChart data={revenue ?? []} />
        <OrdersPerDayChart data={ordersPerDay ?? []} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <HorizontalBarChart title="Fallas frecuentes" data={faults ?? []} dataKey="count" nameKey="fault" />
        <HorizontalBarChart
          title="Repuestos más utilizados"
          data={(partsUsage ?? []).map((p) => ({ name: p.product?.name ?? 'N/D', quantity: p.quantity }))}
          dataKey="quantity"
          nameKey="name"
        />
      </div>
    </div>
  );
}
