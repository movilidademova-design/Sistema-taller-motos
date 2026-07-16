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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OrderStatusBadge } from '@/components/shared/order-status-badge';
import { ChecklistTab } from '@/components/orders/checklist-tab';
import { PhotosTab } from '@/components/orders/photos-tab';
import { DiagnosisTab } from '@/components/orders/diagnosis-tab';
import { QuotationTab } from '@/components/orders/quotation-tab';
import { LaborTab } from '@/components/orders/labor-tab';
import { HistoryTab } from '@/components/orders/history-tab';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api, openAuthedBlobInNewTab } from '@/lib/api';
import { getErrorMessage, useAuth } from '@/components/providers/auth-provider';
import { ORDER_STATUS_LABELS, canTransition, PaymentMethod, type OrderStatus } from '@taller/shared';
import type { Invoice, Order } from '@/lib/types';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { data: order, isLoading, mutate } = useApiSWR<Order>(`/orders/${id}`);
  const { user } = useAuth();
  const canChangeStatus = !!user?.permissions['orders.changeStatus'];

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
            {canChangeStatus && (
              <StatusChanger orderId={order.id} currentStatus={order.status} onUpdated={() => mutate()} />
            )}
            <InvoiceActions order={order} onUpdated={() => mutate()} />
            {!canChangeStatus && (
              <p className="text-xs text-muted-foreground">Solo lectura — tu rol no puede modificar esta orden.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="checklist">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="photos">Fotos</TabsTrigger>
          <TabsTrigger value="diagnosis">Diagnóstico</TabsTrigger>
          <TabsTrigger value="quotation">Cotización</TabsTrigger>
          <TabsTrigger value="labor">Mano de obra</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="checklist">
          <ChecklistTab orderId={order.id} items={order.checklistItems ?? []} onUpdated={() => mutate()} />
        </TabsContent>
        <TabsContent value="photos">
          <PhotosTab orderId={order.id} photos={order.photos ?? []} onUpdated={() => mutate()} />
        </TabsContent>
        <TabsContent value="diagnosis">
          <DiagnosisTab orderId={order.id} diagnosis={order.diagnosis} onUpdated={() => mutate()} />
        </TabsContent>
        <TabsContent value="quotation">
          <QuotationTab orderId={order.id} quotation={order.quotation} onUpdated={() => mutate()} />
        </TabsContent>
        <TabsContent value="labor">
          <LaborTab orderId={order.id} entries={order.laborEntries ?? []} onUpdated={() => mutate()} />
        </TabsContent>
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
}: {
  orderId: string;
  currentStatus: OrderStatus;
  onUpdated: () => void;
}) {
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [deliveryOpen, setDeliveryOpen] = React.useState(false);
  const [notifyPromptOpen, setNotifyPromptOpen] = React.useState(false);
  const [isRequestingNotification, setIsRequestingNotification] = React.useState(false);

  async function applyStatus(status: string, exitCode?: string): Promise<boolean> {
    setIsUpdating(true);
    try {
      await api.patch(`/orders/${orderId}/status`, { status, exitCode });
      toast.success('Estado actualizado');
      onUpdated();
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error));
      return false;
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleChange(status: string) {
    if (status === 'DELIVERED') {
      setDeliveryOpen(true);
      return;
    }
    const success = await applyStatus(status);
    if (success) setNotifyPromptOpen(true);
  }

  async function handleRequestNotification() {
    setIsRequestingNotification(true);
    try {
      await api.post(`/orders/${orderId}/notifications`);
      toast.success('Notificación pendiente creada para el personal de mostrador');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsRequestingNotification(false);
      setNotifyPromptOpen(false);
    }
  }

  const nextStatusOptions = (Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).filter((status) =>
    canTransition(currentStatus, status),
  );

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">Cambiar estado</Label>
      <Select value={currentStatus} onValueChange={handleChange} disabled={isUpdating}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {nextStatusOptions.map((status) => (
            <SelectItem key={status} value={status}>
              {ORDER_STATUS_LABELS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
        <DialogContent>
          <DeliveryConfirmForm
            isSubmitting={isUpdating}
            onConfirm={async (exitCode) => {
              const success = await applyStatus('DELIVERED', exitCode);
              if (success) {
                setDeliveryOpen(false);
                setNotifyPromptOpen(true);
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={notifyPromptOpen} onOpenChange={setNotifyPromptOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Desea generar una notificación para el cliente?</DialogTitle>
            <DialogDescription>
              El personal de mostrador podrá enviarle un aviso por WhatsApp o correo sobre este
              cambio de estado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setNotifyPromptOpen(false)}
              disabled={isRequestingNotification}
            >
              No
            </Button>
            <Button onClick={handleRequestNotification} disabled={isRequestingNotification}>
              {isRequestingNotification ? 'Generando...' : 'Sí'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeliveryConfirmForm({
  isSubmitting,
  onConfirm,
}: {
  isSubmitting: boolean;
  onConfirm: (exitCode: string) => Promise<void>;
}) {
  const [exitCode, setExitCode] = React.useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onConfirm(exitCode);
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Entregar vehículo</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3 py-4">
        <p className="text-sm text-muted-foreground">
          Pide al cliente su clave de salida y verifica que coincida antes de entregar el vehículo.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label>Clave de salida</Label>
          <Input
            autoFocus
            inputMode="numeric"
            className="h-12 text-center text-2xl tracking-widest"
            value={exitCode}
            onChange={(e) => setExitCode(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || !exitCode.trim()} className="w-full">
          {isSubmitting ? 'Verificando...' : 'Confirmar entrega'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function InvoiceActions({ order, onUpdated }: { order: Order; onUpdated: () => void }) {
  const { user } = useAuth();
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [paymentOpen, setPaymentOpen] = React.useState(false);
  const canInvoice =
    order.quotation?.status === 'APPROVED' && !order.invoice && !!user?.permissions['invoices.create'];
  const canRegisterPayment = !!user?.permissions['payments.create'];

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
      {canRegisterPayment && (
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
      )}
    </div>
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
