'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, Clipboard, Mail, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { useAuth } from '@/components/providers/auth-provider';
import type { OrderNotification } from '@/lib/types';

export function OrderNotificationsBell() {
  const { user } = useAuth();
  const canManage = user?.role === 'ADMIN' || user?.role === 'RECEPTIONIST';

  const { data: notifications, mutate } = useApiSWR<OrderNotification[]>(
    canManage ? '/order-notifications' : null,
    { refreshInterval: 15000 },
  );

  if (!canManage) return null;

  const pendingCount = notifications?.length ?? 0;

  async function handleMarkNotified(id: string) {
    try {
      await api.patch(`/order-notifications/${id}/mark-notified`);
      mutate();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function handleSendEmail(id: string) {
    try {
      await api.post(`/order-notifications/${id}/send-email`);
      toast.success('Correo enviado');
      mutate();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  function handleWhatsapp(notification: OrderNotification) {
    const phone = (notification.order?.client.phone ?? '').replace(/[^0-9]/g, '');
    if (!phone) {
      toast.error('El cliente no tiene teléfono registrado');
      return;
    }
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(notification.message)}`,
      '_blank',
    );
    void handleMarkNotified(notification.id);
  }

  async function handleCopy(notification: OrderNotification) {
    await navigator.clipboard.writeText(notification.message);
    toast.success('Mensaje copiado');
    void handleMarkNotified(notification.id);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          {pendingCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
            >
              {pendingCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b p-3 text-sm font-medium">Notificaciones pendientes</div>
        <div className="max-h-96 overflow-y-auto">
          {pendingCount === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              No hay notificaciones pendientes
            </p>
          )}
          {notifications?.map((notification) => (
            <div key={notification.id} className="flex flex-col gap-2 border-b p-3 last:border-b-0">
              {notification.order && (
                <Link
                  href={`/orders/${notification.order.id}`}
                  className="text-xs font-medium hover:underline"
                >
                  Orden #{notification.order.orderNumber} —{' '}
                  {notification.order.client.firstName} {notification.order.client.lastName}
                </Link>
              )}
              <p className="line-clamp-3 text-xs whitespace-pre-line text-muted-foreground">
                {notification.message}
              </p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 text-xs"
                  onClick={() => handleWhatsapp(notification)}
                >
                  <MessageCircle className="size-3" /> WhatsApp
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 text-xs"
                  onClick={() => handleSendEmail(notification.id)}
                  disabled={!notification.order?.client.email}
                >
                  <Mail className="size-3" /> Correo
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 flex-1 text-xs"
                  onClick={() => handleCopy(notification)}
                >
                  <Clipboard className="size-3" /> Copiar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
