// apps/web/src/app/(app)/notifications/page.tsx
'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotificationActions } from '@/components/notifications/notification-actions';
import { useApiSWR } from '@/hooks/use-api-swr';
import type { Notification, PaginatedResult } from '@/lib/types';

const CHANNEL_LABELS: Record<'WHATSAPP' | 'EMAIL' | 'COPY', string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'correo',
  COPY: 'portapapeles',
};

export default function NotificationsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Notificaciones</h1>
      <Tabs defaultValue="PENDING">
        <TabsList>
          <TabsTrigger value="PENDING">Pendientes</TabsTrigger>
          <TabsTrigger value="SENT">Notificadas</TabsTrigger>
        </TabsList>
        <TabsContent value="PENDING">
          <NotificationList status="PENDING" />
        </TabsContent>
        <TabsContent value="SENT">
          <NotificationList status="SENT" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NotificationList({ status }: { status: 'PENDING' | 'SENT' }) {
  const { data, isLoading, mutate } = useApiSWR<PaginatedResult<Notification>>(
    `/notifications?status=${status}&pageSize=50`,
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 pt-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return <p className="pt-4 text-sm text-muted-foreground">Sin notificaciones aquí.</p>;
  }

  return (
    <div className="flex flex-col gap-3 pt-4">
      {data.items.map((n) => (
        <Card key={n.id}>
          <CardContent className="flex flex-col gap-2 pt-6 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">Orden #{n.order.orderNumber}</p>
              <Badge variant={status === 'SENT' ? 'success' : 'warning'}>
                {status === 'SENT' ? 'Notificada' : 'Pendiente'}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {n.order.client.firstName} {n.order.client.lastName}
            </p>
            {/* El enlace del PDF de una cotización es una cadena larga sin
                espacios: sin break-words desborda la tarjeta a lo ancho. */}
            <p className="whitespace-pre-line break-words">{n.message}</p>
            {status === 'PENDING' && <NotificationActions notification={n} onSent={() => mutate()} />}
            {status === 'SENT' && n.sentBy && (
              <p className="text-xs text-muted-foreground">
                Enviada por {n.sentBy.firstName} {n.sentBy.lastName} vía{' '}
                {n.sentVia ? CHANNEL_LABELS[n.sentVia] : ''}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
