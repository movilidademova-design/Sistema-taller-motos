'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, API_ORIGIN } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { toWhatsappPhone } from '@/lib/phone';
import { QuotationItemType, QUOTATION_STATUS_LABELS, type QuotationStatus } from '@taller/shared';
import type { Quotation } from '@/lib/types';

interface ItemDraft {
  productId?: string | null;
  type: QuotationItemType;
  description: string;
  quantity: number;
  unitPrice: number;
}

const TYPE_LABELS: Record<QuotationItemType, string> = {
  PART: 'Repuesto',
  OTHER: 'Otro',
};

// Estados en los que el editor de ítems sigue habilitado — el resto se muestra en solo lectura.
const EDITABLE_STATUSES: QuotationStatus[] = ['DRAFT', 'PENDING_REVIEW', 'READY_TO_SEND', 'PARTIALLY_APPROVED'];

const STATUS_BADGE_VARIANT: Record<QuotationStatus, 'success' | 'destructive' | 'warning' | 'secondary'> = {
  DRAFT: 'secondary',
  PENDING_REVIEW: 'warning',
  READY_TO_SEND: 'warning',
  SENT: 'warning',
  APPROVED: 'success',
  PARTIALLY_APPROVED: 'warning',
  REJECTED: 'destructive',
};

export function QuotationTab({
  orderId,
  quotation,
  clientPhone,
  onUpdated,
}: {
  orderId: string;
  quotation: Quotation | null | undefined;
  clientPhone?: string | null;
  onUpdated: () => void;
}) {
  const [items, setItems] = React.useState<ItemDraft[]>(
    quotation?.items.map((i) => ({
      productId: i.productId,
      type: i.type,
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
    })) ?? [],
  );
  const [discount, setDiscount] = React.useState(quotation?.discount ?? '0');
  const [taxRate, setTaxRate] = React.useState(quotation?.taxRate ?? '0');
  const [notes, setNotes] = React.useState(quotation?.notes ?? '');
  const [statusNotes, setStatusNotes] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [isChangingStatus, setIsChangingStatus] = React.useState(false);

  const isEditable = !quotation || EDITABLE_STATUSES.includes(quotation.status);
  const isTerminal = quotation?.status === 'APPROVED' || quotation?.status === 'REJECTED';
  const hasZeroPriceItems = isEditable && items.some((i) => i.unitPrice <= 0);
  const whatsappPhone = clientPhone ? toWhatsappPhone(clientPhone) : null;

  const subtotal = items.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0);
  const taxable = Math.max(0, subtotal - Number(discount || 0));
  const computedTax = taxable * (Number(taxRate || 0) / 100);
  const computedTotal = taxable + computedTax;

  function addItem() {
    setItems((i) => [...i, { type: QuotationItemType.PART, description: '', quantity: 1, unitPrice: 0 }]);
  }
  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((i) => i.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  }
  function removeItem(index: number) {
    setItems((i) => i.filter((_, idx) => idx !== index));
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await api.put(`/orders/${orderId}/quotation`, {
        items: items.map((i) => ({
          type: i.type,
          productId: i.productId ?? undefined,
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        discount: Number(discount || 0),
        taxRate: Number(taxRate || 0),
        notes: notes || undefined,
      });
      toast.success('Cotización guardada');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGeneratePdf() {
    setIsGeneratingPdf(true);
    try {
      await api.post(`/orders/${orderId}/quotation/pdf`);
      toast.success('PDF generado');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  function handleViewPdf() {
    if (!quotation?.pdfUrl) return;
    window.open(`${API_ORIGIN}${quotation.pdfUrl}`, '_blank');
  }

  async function handleSendWhatsapp() {
    if (!whatsappPhone || !quotation?.pdfUrl) return;
    setIsSending(true);
    try {
      const message = `Hola. Le compartimos la cotización de los repuestos para su vehículo. Puede verla aquí: ${API_ORIGIN}${quotation.pdfUrl}`;
      // Opened before the send call: this is an irreversible external action (a new
      // tab), so a failed send shouldn't look like nothing happened — the catch below says so.
      window.open(`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`, '_blank');
      await api.post(`/orders/${orderId}/quotation/send`);
      onUpdated();
    } catch (error) {
      toast.error(`Se abrió WhatsApp, pero no se pudo marcar como enviada: ${getErrorMessage(error)}`);
    } finally {
      setIsSending(false);
    }
  }

  async function handleChangeStatus(status: QuotationStatus) {
    setIsChangingStatus(true);
    try {
      await api.patch(`/orders/${orderId}/quotation/status`, { status, notes: statusNotes || undefined });
      toast.success('Estado actualizado');
      setStatusNotes('');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsChangingStatus(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {quotation && (
        <div>
          <Badge variant={STATUS_BADGE_VARIANT[quotation.status]}>{QUOTATION_STATUS_LABELS[quotation.status]}</Badge>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Ítems</Label>
          {isEditable && (
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              <Plus /> Agregar
            </Button>
          )}
        </div>

        {isEditable
          ? items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={item.type} onValueChange={(v) => updateItem(i, { type: v as QuotationItemType })}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Descripción"
                  className="flex-1"
                  value={item.description}
                  onChange={(e) => updateItem(i, { description: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="Cant."
                  className="w-20"
                  value={item.quantity}
                  onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                />
                <Input
                  type="number"
                  placeholder="Precio unit."
                  className={item.unitPrice <= 0 ? 'w-28 border-destructive text-destructive' : 'w-28'}
                  value={item.unitPrice}
                  onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))
          : (quotation?.items ?? []).map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                <span className="w-36 text-muted-foreground">{TYPE_LABELS[item.type]}</span>
                <span className="flex-1">{item.description}</span>
                <span className="w-20 text-right">{Number(item.quantity)}</span>
                <span
                  className={
                    Number(item.unitPrice) <= 0 ? 'w-28 text-right text-destructive' : 'w-28 text-right'
                  }
                >
                  ${Number(item.unitPrice).toLocaleString('es-CO')}
                </span>
              </div>
            ))}
        {isEditable && items.length === 0 && <p className="text-sm text-muted-foreground">Sin ítems agregados</p>}
      </div>

      {isEditable ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label>Descuento</Label>
              <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Impuesto (%)</Label>
              <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>${subtotal.toLocaleString('es-CO')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Descuento</span>
              <span>-${Number(discount || 0).toLocaleString('es-CO')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Impuestos</span>
              <span>${computedTax.toLocaleString('es-CO')}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>${computedTotal.toLocaleString('es-CO')}</span>
            </div>
          </div>
        </>
      ) : (
        quotation && (
          <div className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
            {quotation.notes && <p className="text-muted-foreground">{quotation.notes}</p>}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>${Number(quotation.partsCost).toLocaleString('es-CO')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Descuento</span>
              <span>-${Number(quotation.discount).toLocaleString('es-CO')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Impuestos</span>
              <span>${Number(quotation.taxAmount).toLocaleString('es-CO')}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span>${Number(quotation.total).toLocaleString('es-CO')}</span>
            </div>
          </div>
        )
      )}

      {!isTerminal && (
        <div className="flex flex-col gap-2">
          {hasZeroPriceItems && (
            <p className="text-sm text-destructive">Ponle precio a todos los repuestos antes de generar el PDF</p>
          )}

          {quotation?.status === 'SENT' && (
            <div className="flex flex-col gap-1.5">
              <Label>Observaciones (opcional)</Label>
              <Textarea value={statusNotes} onChange={(e) => setStatusNotes(e.target.value)} />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {isEditable && (
              <>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Guardando...' : 'Guardar cambios'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf || items.length === 0 || hasZeroPriceItems}
                >
                  {isGeneratingPdf ? 'Generando...' : 'Generar PDF'}
                </Button>
              </>
            )}
            {quotation?.status === 'READY_TO_SEND' && (
              <Button
                type="button"
                onClick={handleSendWhatsapp}
                disabled={isSending || !whatsappPhone}
                title={!whatsappPhone ? 'El cliente no tiene un teléfono registrado' : undefined}
              >
                {isSending ? 'Enviando...' : 'Enviar por WhatsApp'}
              </Button>
            )}
            {quotation?.status === 'SENT' && (
              <>
                <Button type="button" disabled={isChangingStatus} onClick={() => handleChangeStatus('APPROVED')}>
                  Aprobada
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isChangingStatus}
                  onClick={() => handleChangeStatus('PARTIALLY_APPROVED')}
                >
                  Aprobada parcialmente
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isChangingStatus}
                  onClick={() => handleChangeStatus('REJECTED')}
                >
                  Rechazada
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Fuera del bloque de acciones: una cotización aprobada o rechazada ya no
          se puede tocar, pero su PDF es justo el documento que hay que poder
          reabrir después — es lo que el cliente aceptó. */}
      {quotation?.pdfUrl && (
        <div>
          <Button type="button" variant="outline" onClick={handleViewPdf}>
            Ver PDF
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label>Historial</Label>
        {(quotation?.history ?? []).length === 0 && <p className="text-sm text-muted-foreground">Sin historial</p>}
        <ul className="flex flex-col gap-1.5 text-sm">
          {(quotation?.history ?? []).map((h) => (
            <li key={h.id} className="text-muted-foreground">
              <span className="font-medium text-foreground">
                «{h.changedBy ? `${h.changedBy.firstName} ${h.changedBy.lastName}` : 'Sistema'}»
              </span>{' '}
              · {new Date(h.createdAt).toLocaleString('es-CO')} ·{' '}
              {h.fromStatus ? QUOTATION_STATUS_LABELS[h.fromStatus] : 'Nuevo'} → {QUOTATION_STATUS_LABELS[h.toStatus]}
              {h.notes && <div className="text-xs">{h.notes}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
