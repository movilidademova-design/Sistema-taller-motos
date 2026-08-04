'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { QuotationTab } from '@/components/orders/quotation-tab';
import { useApiSWR } from '@/hooks/use-api-swr';
import type { Order } from '@/lib/types';

export default function QuotationDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = React.use(params);
  const { data: order, isLoading, mutate } = useApiSWR<Order>(`/orders/${orderId}`);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!order) return <p>Orden no encontrada.</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/quotations" className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4" /> Cotizaciones
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {order.client?.firstName} {order.client?.lastName}
          </h1>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
          <span>
            {order.motorcycle?.brand} {order.motorcycle?.model}
          </span>
          <Link href={`/orders/${order.id}`} className="hover:underline">
            Orden #{order.orderNumber} ›
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cotización</CardTitle>
        </CardHeader>
        <CardContent>
          <QuotationTab
            orderId={order.id}
            quotation={order.quotation}
            clientPhone={order.client?.phone}
            onUpdated={() => mutate()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
