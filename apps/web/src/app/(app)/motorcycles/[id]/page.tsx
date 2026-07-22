'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { OrderStatusBadge } from '@/components/shared/order-status-badge';
import { useApiSWR } from '@/hooks/use-api-swr';
import type { Motorcycle } from '@/lib/types';

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value ?? '—'}</span>
    </div>
  );
}

export default function MotorcycleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { data: moto, isLoading } = useApiSWR<Motorcycle>(`/motorcycles/${id}`);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!moto) return <p>Vehículo no encontrado.</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/motorcycles" className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4" /> Vehículos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {moto.brand} {moto.model}
        </h1>
        {moto.client && (
          <Link href={`/clients/${moto.client.id}`} className="text-sm text-muted-foreground hover:underline">
            {moto.client.firstName} {moto.client.lastName}
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Ficha técnica</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Color" value={moto.color} />
          <Field label="Año" value={moto.year} />
          <Field label="Número de serie" value={moto.serialNumber} />
          <Field label="Número de motor" value={moto.motorNumber} />
          <Field label="Número de batería" value={moto.batteryNumber} />
          <Field label="Capacidad de batería" value={moto.batteryCapacity} />
          <Field label="Voltaje" value={moto.voltage} />
          <Field label="Controlador" value={moto.controller} />
          <Field label="Pantalla" value={moto.display} />
          <Field label="Kilometraje" value={moto.mileage ? `${moto.mileage} km` : undefined} />
          <Field
            label="Fecha de compra"
            value={moto.purchaseDate ? new Date(moto.purchaseDate).toLocaleDateString('es-CO') : undefined}
          />
          <Field
            label="Garantía hasta"
            value={moto.warrantyUntil ? new Date(moto.warrantyUntil).toLocaleDateString('es-CO') : undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Historial de órdenes</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Orden</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="pr-6">Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {moto.orders?.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="pl-6">
                    <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                      #{o.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-64 truncate">{o.reason}</TableCell>
                  <TableCell>
                    <OrderStatusBadge status={o.status} />
                  </TableCell>
                  <TableCell className="pr-6">{new Date(o.receivedAt).toLocaleDateString('es-CO')}</TableCell>
                </TableRow>
              ))}
              {(!moto.orders || moto.orders.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Sin órdenes registradas
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
