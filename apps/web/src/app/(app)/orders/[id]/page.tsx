'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OrderStatusBadge } from '@/components/shared/order-status-badge';
import { NotifyClientDialog } from '@/components/orders/notify-client-dialog';
import { PhotosTab } from '@/components/orders/photos-tab';
import { DiagnosisTab } from '@/components/orders/diagnosis-tab';
import { QuotationTab } from '@/components/orders/quotation-tab';
import { HistoryTab } from '@/components/orders/history-tab';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api, openAuthedBlobInNewTab } from '@/lib/api';
import { getErrorMessage, useAuth } from '@/components/providers/auth-provider';
import { ORDER_STATUS_LABELS, PaymentMethod, type OrderStatus } from '@taller/shared';
import type { Invoice, Order } from '@/lib/types';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { data: order, isLoading, mutate } = useApiSWR<Order>(`/orders/${id}`);
  const [notifyOpen, setNotifyOpen] = React.useState(false);
  const { user } = useAuth();
  const isTechnician = user?.role === 'TECHNICIAN';

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
        <Link href="/orders" className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4" /> Órdenes
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Orden #{order.orderNumber}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted-foreground">
          <Link href={`/clients/${order.clientId}`} className="hover:underline">
            {order.client?.firstName} {order.client?.lastName}
          </Link>
          <Link href={`/motorcycles/${order.motorcycleId}`} className="hover:underline">
            {order.motorcycle?.brand} {order.motorcycle?.model}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Detalle de recepción</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">Motivo: </span>
              {order.reason}
            </p>
            {order.accessoriesDelivered && (
              <p>
                <span className="text-muted-foreground">Accesorios: </span>
                {order.accessoriesDelivered}
              </p>
            )}
            <p>
              <span className="text-muted-foreground">Recepcionista: </span>
              {order.receptionist?.firstName} {order.receptionist?.lastName}
            </p>
            <p>
              <span className="text-muted-foreground">Técnico: </span>
              {order.technician ? `${order.technician.firstName} ${order.technician.lastName}` : 'Sin asignar'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Acciones</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <StatusChanger
              orderId={order.id}
              currentStatus={order.status}
              onUpdated={() => mutate()}
              onNotify={() => setNotifyOpen(true)}
            />
            {order.status === 'READY_FOR_DELIVERY' && (
              <DeliverVehicleDialog
                orderId={order.id}
                onUpdated={() => mutate()}
                onNotify={() => setNotifyOpen(true)}
              />
            )}
            <InvoiceActions order={order} onUpdated={() => mutate()} />
          </CardContent>
        </Card>
      </div>

      {/*
        Rendered here (not inside StatusChanger/DeliverVehicleDialog) because this page is
        never conditionally unmounted the way DeliverVehicleDialog is (it disappears once
        order.status leaves READY_FOR_DELIVERY, which happens immediately after a successful
        delivery) — keeping the dialog's open state at this level means it survives the
        status-driven remount of its trigger.
      */}
      <NotifyClientDialog orderId={order.id} open={notifyOpen} onOpenChange={setNotifyOpen} />

      <Tabs defaultValue="diagnosis">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="diagnosis">Diagnóstico</TabsTrigger>
          <TabsTrigger value="photos">Fotos</TabsTrigger>
          {!isTechnician && <TabsTrigger value="quotation">Cotización</TabsTrigger>}
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="diagnosis">
          <DiagnosisTab orderId={order.id} diagnosis={order.diagnosis} onUpdated={() => mutate()} />
        </TabsContent>
        <TabsContent value="photos">
          <PhotosTab orderId={order.id} photos={order.photos ?? []} onUpdated={() => mutate()} />
        </TabsContent>
        {!isTechnician && (
          <TabsContent value="quotation">
            <QuotationTab orderId={order.id} quotation={order.quotation} onUpdated={() => mutate()} />
          </TabsContent>
        )}
        <TabsContent value="history">
          <HistoryTab history={order.statusHistory ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusChanger({
  orderId,
  currentStatus,
  onUpdated,
  onNotify,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  onUpdated: () => void;
  onNotify: () => void;
}) {
  const [isUpdating, setIsUpdating] = React.useState(false);

  async function handleChange(status: string) {
    setIsUpdating(true);
    try {
      await api.patch(`/orders/${orderId}/status`, { status });
      toast.success('Estado actualizado');
      onUpdated();
      onNotify();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">Cambiar estado</Label>
      <Select value={currentStatus} onValueChange={handleChange} disabled={isUpdating}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(ORDER_STATUS_LABELS)
            .filter(([value]) => value !== 'DELIVERED' || value === currentStatus)
            .map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function InvoiceActions({ order, onUpdated }: { order: Order; onUpdated: () => void }) {
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const canInvoice = order.quotation?.status === 'APPROVED' && !order.invoice;

  async function handleGenerateInvoice() {
    setIsGenerating(true);
    try {
      await api.post<Invoice>('/invoices', { orderId: order.id });
      toast.success('Factura generada');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {canInvoice && (
        <Button size="sm" onClick={handleGenerateInvoice} disabled={isGenerating}>
          <FileText /> {isGenerating ? 'Generando...' : 'Generar factura'}
        </Button>
      )}
      {order.invoice && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => openAuthedBlobInNewTab(`/invoices/${order.invoice!.id}/pdf`)}
        >
          <FileText /> Ver factura {order.invoice.invoiceNumber}
        </Button>
      )}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Receipt /> Registrar pago
          </Button>
        </DialogTrigger>
        <DialogContent>
          <RecordPaymentForm
            order={order}
            onSuccess={() => {
              setPaymentOpen(false);
              onUpdated();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeliverVehicleDialog({
  orderId,
  onUpdated,
  onNotify,
}: {
  orderId: string;
  onUpdated: () => void;
  onNotify: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pickupCode, setPickupCode] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api.post(`/orders/${orderId}/deliver`, { pickupCode });
      toast.success('Vehículo entregado');
      setOpen(false);
      setPickupCode('');
      onUpdated();
      // Delay so this dialog's close animation finishes before the notify dialog
      // opens — opening it in the same tick stacks two overlays mid-transition.
      setTimeout(onNotify, 200);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPickupCode('');
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Entregar vehículo</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Entregar vehículo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 py-4">
            <Label>Clave de retiro</Label>
            <Input
              required
              inputMode="numeric"
              maxLength={6}
              value={pickupCode}
              onChange={(e) => setPickupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || !/^\d{6}$/.test(pickupCode)}>
              {isSubmitting ? 'Verificando...' : 'Confirmar entrega'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentForm({ order, onSuccess }: { order: Order; onSuccess: () => void }) {
  const [method, setMethod] = React.useState<PaymentMethod>(PaymentMethod.CASH);
  const [amount, setAmount] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/payments', {
        clientId: order.clientId,
        orderId: order.id,
        invoiceId: order.invoice?.id,
        method,
        amount: Number(amount),
        reference: reference || undefined,
      });
      toast.success('Pago registrado');
      onSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Registrar pago</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3 py-4">
        <div className="flex flex-col gap-1.5">
          <Label>Método de pago</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASH">Efectivo</SelectItem>
              <SelectItem value="TRANSFER">Transferencia</SelectItem>
              <SelectItem value="CARD">Tarjeta</SelectItem>
              <SelectItem value="QR">QR</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Monto</Label>
          <Input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Referencia (opcional)</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || !amount}>
          {isSubmitting ? 'Guardando...' : 'Registrar pago'}
        </Button>
      </DialogFooter>
    </form>
  );
}
