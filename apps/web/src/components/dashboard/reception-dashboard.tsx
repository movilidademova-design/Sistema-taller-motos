import {
  ClipboardList,
  Bell,
  PackageCheck,
  CalendarClock,
  CircleDollarSign,
  UserPlus,
} from 'lucide-react';
import { useApiSWR } from '@/hooks/use-api-swr';
import { StatCard } from './stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DashboardSummary } from '@/lib/types';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    value,
  );
}

export function ReceptionDashboard() {
  const { data: summary, isLoading } = useApiSWR<DashboardSummary>('/dashboard/summary');
  const { data: pendingNotifications } = useApiSWR<unknown[]>('/order-notifications');
  const cards = summary?.cards;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      <StatCard
        label="Citas de hoy"
        value={cards?.todaysAppointments ?? 0}
        icon={CalendarClock}
      />
      <StatCard label="Órdenes creadas hoy" value={cards?.ordersCreatedToday ?? 0} icon={ClipboardList} />
      <StatCard
        label="Clientes nuevos (mes)"
        value={cards?.newClientsThisMonth ?? 0}
        icon={UserPlus}
      />
      <StatCard
        label="Notificaciones pendientes"
        value={pendingNotifications?.length ?? 0}
        icon={Bell}
        accent="warning"
      />
      <StatCard
        label="Listas para entrega"
        value={cards?.readyForDelivery ?? 0}
        icon={PackageCheck}
        accent="success"
      />
      <StatCard
        label="Caja del día"
        value={formatCurrency(cards?.revenueToday ?? 0)}
        icon={CircleDollarSign}
        accent="success"
      />
    </div>
  );
}
