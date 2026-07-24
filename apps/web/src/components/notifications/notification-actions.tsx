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
    setIsSending(true);
    try {
      // Opened before the mark-sent call: this is an irreversible external
      // action (a new tab), so a failed mark-sent shouldn't look like nothing
      // happened — the catch below says so explicitly.
      window.open(
        `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(notification.message)}`,
        '_blank',
      );
      await api.post(`/notifications/${notification.id}/mark-sent`, { channel: 'WHATSAPP' });
      onSent();
    } catch (error) {
      toast.error(`Se abrió WhatsApp, pero no se pudo marcar como enviada: ${getErrorMessage(error)}`);
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
    try {
      await navigator.clipboard.writeText(notification.message);
    } catch {
      toast.error('No se pudo copiar el mensaje al portapapeles');
      return;
    }
    toast.success('Mensaje copiado');
    setIsSending(true);
    try {
      await api.post(`/notifications/${notification.id}/mark-sent`, { channel: 'COPY' });
      onSent();
    } catch (error) {
      toast.error(`Se copió el mensaje, pero no se pudo marcar como enviada: ${getErrorMessage(error)}`);
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
