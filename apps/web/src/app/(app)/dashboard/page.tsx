'use client';

import { useAuth } from '@/components/providers/auth-provider';
import { AdminDashboard } from '@/components/dashboard/admin-dashboard';
import { ReceptionDashboard } from '@/components/dashboard/reception-dashboard';
import { TechnicianDashboard } from '@/components/dashboard/technician-dashboard';

const TITLES: Record<string, { title: string; subtitle: string }> = {
  RECEPTIONIST: { title: 'Panel de recepción', subtitle: 'Lo que pasa hoy en tu sucursal' },
  TECHNICIAN: { title: 'Panel técnico', subtitle: 'Tus órdenes y reparaciones en curso' },
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { title, subtitle } = TITLES[user?.role ?? ''] ?? {
    title: 'Panel',
    subtitle: 'Resumen general del taller en tiempo real',
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {user?.role === 'RECEPTIONIST' && <ReceptionDashboard />}
      {user?.role === 'TECHNICIAN' && <TechnicianDashboard />}
      {(user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'VIEWER') && <AdminDashboard />}
    </div>
  );
}
