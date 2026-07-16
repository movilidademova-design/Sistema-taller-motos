import { ClipboardList, Wrench, Hammer, PackageSearch } from 'lucide-react';
import { useApiSWR } from '@/hooks/use-api-swr';
import { StatCard } from './stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardSummary, PaginatedResult, Order } from '@/lib/types';

export function TechnicianDashboard() {
  const { data: summary, isLoading } = useApiSWR<DashboardSummary>('/dashboard/summary');
  const { data: myOrders } = useApiSWR<PaginatedResult<Order>>('/orders?pageSize=1');
  const cards = summary?.cards;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <StatCard label="Mis órdenes asignadas" value={myOrders?.total ?? 0} icon={ClipboardList} />
      <StatCard label="En diagnóstico" value={cards?.diagnosing ?? 0} icon={Wrench} />
      <StatCard label="Reparaciones en curso" value={cards?.inRepair ?? 0} icon={Hammer} />
      <StatCard
        label="Repuestos pendientes"
        value={cards?.waitingParts ?? 0}
        icon={PackageSearch}
        accent="warning"
      />
    </div>
  );
}
