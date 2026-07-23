'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { toWhatsappPhone } from '@/lib/phone';
import type { Notification } from '@/lib/types';

export function NotificationActions({
  notification,
  onSent,
}: {
  notification: Notification;
  onSent: () => void;
}) {
  const [isSending, setIsSending] = React.useState(false);
  const phone = notification.order.client.phone;
  const email = notification.order.client.email;
  const whatsappPhone = phone ? toWhatsappPhone(phone) : null;

  async function handleWhatsapp() {
    if (!whatsappPhone) return;
    window.open(
      `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(notification.message)}`,
      '_blank',
    );
    setIsSending(true);
    try {
      await api.post(`/notifications/${notification.id}/mark-sent`, { channel: 'WHATSAPP' });
      onSent();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  }

  async function handleEmail() {
    setIsSending(true);
    try {
      await api.post(`/notifications/${notification.id}/send-email`);
      toast.success('Correo enviado');
      onSent();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(notification.message);
    toast.success('Mensaje copiado');
    setIsSending(true);
    try {
      await api.post(`/notifications/${notification.id}/mark-sent`, { channel: 'COPY' });
      onSent();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {whatsappPhone && (
        <Button size="sm" onClick={handleWhatsapp} disabled={isSending}>
          WhatsApp
        </Button>
      )}
      {email && (
        <Button size="sm" variant="outline" onClick={handleEmail} disabled={isSending}>
          Correo
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={handleCopy} disabled={isSending}>
        Copiar
      </Button>
    </div>
  );
}
