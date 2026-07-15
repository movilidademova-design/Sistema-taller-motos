'use client';

import * as React from 'react';
import { use } from 'react';
import { Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { OrderStatusBadge } from '@/components/shared/order-status-badge';
import { API_URL } from '@/lib/api';
import { ORDER_STATUS_LABELS, VEHICLE_TYPE_LABELS, type OrderStatus } from '@taller/shared';

interface TrackingStatusEntry {
  toStatus: OrderStatus;
  createdAt: string;
}

interface TrackingData {
  orderNumber: string;
  tenantName: string;
  status: OrderStatus;
  vehicle: { brand: string; model: string; vehicleType: keyof typeof VEHICLE_TYPE_LABELS };
  statusHistory: TrackingStatusEntry[];
  receivedAt: string;
}

export default function TrackOrderPage({ params }: { params: Promise<{ trackingToken: string }> }) {
  const { trackingToken } = use(params);
  const [data, setData] = React.useState<TrackingData | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    // Fetch directly (no Authorization header, no auth-redirect-on-401 behavior)
    // since this page must work for a client with no session at all.
    fetch(`${API_URL}/public/orders/track/${trackingToken}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        setData(await res.json());
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [trackingToken]);

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col gap-6 p-6">
      {isLoading && (
        <div className="flex flex-col gap-4 pt-10">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {!isLoading && notFound && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-lg font-semibold">Enlace no válido</p>
          <p className="text-sm text-muted-foreground">
            Este enlace de seguimiento no existe o ya no está disponible.
          </p>
        </div>
      )}

      {!isLoading && data && (
        <>
          <div className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">{data.tenantName}</p>
            <p className="text-2xl font-bold tracking-tight">{data.orderNumber}</p>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Estado actual</span>
                <OrderStatusBadge status={data.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Vehículo</span>
                <span className="text-sm font-medium">
                  {data.vehicle.brand} {data.vehicle.model} ({VEHICLE_TYPE_LABELS[data.vehicle.vehicleType]})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Recibido</span>
                <span className="text-sm font-medium">
                  {new Date(data.receivedAt).toLocaleString('es-CO')}
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium">Historial</p>
            <ol className="flex flex-col gap-4 border-l-2 pl-4">
              {data.statusHistory.map((entry, i) => (
                <li key={i} className="relative">
                  <span className="absolute top-0.5 -left-[1.4rem] flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-2.5" />
                  </span>
                  <p className="text-sm font-medium">{ORDER_STATUS_LABELS[entry.toStatus]}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString('es-CO')}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
