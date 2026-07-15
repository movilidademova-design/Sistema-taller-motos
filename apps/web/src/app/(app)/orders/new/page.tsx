'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import SignatureCanvas from 'react-signature-canvas';
import { toast } from 'sonner';
import { Camera, Check, ChevronLeft, Clipboard, Mail, MessageCircle, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api, ApiError } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { cn, formatOrderNumber } from '@/lib/utils';
import { VEHICLE_TYPE_LABELS, VehicleType } from '@taller/shared';
import type { AccessoryOption, Client, Motorcycle, Order, QuickService } from '@/lib/types';

const MIN_PHOTO_SLOTS = 6;
const MAX_PHOTO_SLOTS = 10;

type Phase = 'client' | 'vehicle' | 'services' | 'photos' | 'signature' | 'done';

interface ClientLookupResult extends Client {
  motorcycles: Motorcycle[];
}

interface TenantMini {
  name: string;
  orderPrefix: string;
}

interface PhotoSlot {
  file: File | null;
  preview: string | null;
}

export default function NewOrderPage() {
  const router = useRouter();
  const { data: tenant } = useApiSWR<TenantMini>('/tenant/settings');
  const { data: quickServices } = useApiSWR<QuickService[]>('/quick-services');
  const { data: accessoryOptions } = useApiSWR<AccessoryOption[]>('/accessory-options');

  const [phase, setPhase] = React.useState<Phase>('client');

  const [documentId, setDocumentId] = React.useState('');
  const [searchStatus, setSearchStatus] = React.useState<'idle' | 'loading' | 'found' | 'not-found'>('idle');
  const [foundClient, setFoundClient] = React.useState<ClientLookupResult | null>(null);
  const [isNewClient, setIsNewClient] = React.useState(false);
  const [newClient, setNewClient] = React.useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
  });
  const [selectedVehicleId, setSelectedVehicleId] = React.useState('');
  const [wantsNewVehicle, setWantsNewVehicle] = React.useState(false);

  const [newVehicle, setNewVehicle] = React.useState({
    vehicleType: 'BICIMOTO' as VehicleType,
    brand: '',
    model: '',
    color: '',
    purchaseDate: '',
    serialNumber: '',
  });

  const [selectedServiceIds, setSelectedServiceIds] = React.useState<string[]>([]);
  const [selectedAccessoryIds, setSelectedAccessoryIds] = React.useState<string[]>([]);
  const [otherAccessoryChecked, setOtherAccessoryChecked] = React.useState(false);
  const [otherAccessoryText, setOtherAccessoryText] = React.useState('');
  const [reason, setReason] = React.useState('');

  const [photoSlots, setPhotoSlots] = React.useState<PhotoSlot[]>(
    Array.from({ length: MIN_PHOTO_SLOTS }, () => ({ file: null, preview: null })),
  );

  const sigRef = React.useRef<SignatureCanvas>(null);
  const [termsAccepted, setTermsAccepted] = React.useState(false);

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [createdOrder, setCreatedOrder] = React.useState<Order | null>(null);

  const needsVehicleStep = !selectedVehicleId;
  const lastSearchedDocRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (documentId.trim().length < 6) {
      setSearchStatus('idle');
      setFoundClient(null);
      setIsNewClient(false);
      return;
    }
    const handle = setTimeout(() => {
      void runSearch(documentId.trim());
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  async function runSearch(doc: string) {
    if (doc.length < 4) return;
    // Enter/blur re-trigger a search for the same value the debounce already
    // resolved (e.g. tapping a vehicle card blurs this input) — skip it so it
    // doesn't wipe the vehicle the advisor just picked.
    if (doc === lastSearchedDocRef.current && searchStatus !== 'idle') return;
    lastSearchedDocRef.current = doc;
    setSearchStatus('loading');
    try {
      const client = await api.get<ClientLookupResult>(`/clients/lookup/${doc}`);
      setFoundClient(client);
      setIsNewClient(false);
      setSearchStatus('found');
      setSelectedVehicleId('');
      setWantsNewVehicle(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setFoundClient(null);
        setIsNewClient(true);
        setSearchStatus('not-found');
      } else {
        toast.error(getErrorMessage(error));
        setSearchStatus('idle');
      }
    }
  }

  const clientStepValid = isNewClient
    ? Boolean(newClient.firstName.trim() && newClient.lastName.trim())
    : Boolean(foundClient) && (Boolean(selectedVehicleId) || wantsNewVehicle);

  const vehicleStepValid = Boolean(newVehicle.brand.trim() && newVehicle.model.trim());
  const servicesStepValid = Boolean(reason.trim());

  function setPhotoAt(index: number, file: File | null) {
    setPhotoSlots((prev) => {
      const next = [...prev];
      const current = next[index];
      if (current?.preview) URL.revokeObjectURL(current.preview);
      next[index] = { file, preview: file ? URL.createObjectURL(file) : null };
      return next;
    });
  }

  function addPhotoSlot() {
    setPhotoSlots((prev) => [...prev, { file: null, preview: null }]);
  }

  async function handleFinish() {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      toast.error('Falta la firma del cliente');
      return;
    }
    if (!termsAccepted) {
      toast.error('El cliente debe aceptar los términos y condiciones');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...(isNewClient
          ? {
              newClient: {
                documentId,
                firstName: newClient.firstName,
                lastName: newClient.lastName,
                phone: newClient.phone || undefined,
                email: newClient.email || undefined,
                address: newClient.address || undefined,
              },
            }
          : { clientId: foundClient!.id }),
        ...(needsVehicleStep
          ? {
              newVehicle: {
                vehicleType: newVehicle.vehicleType,
                brand: newVehicle.brand,
                model: newVehicle.model,
                color: newVehicle.color || undefined,
                purchaseDate: newVehicle.purchaseDate || undefined,
                serialNumber: newVehicle.serialNumber || undefined,
              },
            }
          : { motorcycleId: selectedVehicleId }),
        quickServiceIds: selectedServiceIds,
        accessoryIds: selectedAccessoryIds,
        otherAccessories: otherAccessoryChecked ? otherAccessoryText || undefined : undefined,
        reason,
        termsAccepted: true,
      };

      const formData = new FormData();
      formData.append('payload', JSON.stringify(payload));
      for (const slot of photoSlots) {
        if (slot.file) formData.append('photos', slot.file);
      }
      const canvas = sigRef.current.getTrimmedCanvas();
      const dataUrl = canvas.toDataURL('image/png');
      const signatureBlob = await (await fetch(dataUrl)).blob();
      formData.append('signature', signatureBlob, 'firma.png');

      const order = await api.upload<Order>('/orders/intake', formData);
      setCreatedOrder(order);
      setPhase('done');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const stepOrder: Phase[] = needsVehicleStep
    ? ['client', 'vehicle', 'services', 'photos', 'signature']
    : ['client', 'services', 'photos', 'signature'];
  const currentStepIndex = stepOrder.indexOf(phase);

  function goNext() {
    if (phase === 'client') {
      if (!clientStepValid) return;
      setPhase(needsVehicleStep ? 'vehicle' : 'services');
    } else if (phase === 'vehicle') {
      if (!vehicleStepValid) return;
      setPhase('services');
    } else if (phase === 'services') {
      if (!servicesStepValid) return;
      setPhase('photos');
    } else if (phase === 'photos') {
      setPhase('signature');
    }
  }

  function goBack() {
    if (phase === 'vehicle') setPhase('client');
    else if (phase === 'services') setPhase(needsVehicleStep ? 'vehicle' : 'client');
    else if (phase === 'photos') setPhase('services');
    else if (phase === 'signature') setPhase('photos');
  }

  if (phase === 'done' && createdOrder) {
    return <ConfirmationScreen order={createdOrder} tenant={tenant} onDone={() => router.push(`/orders/${createdOrder.id}`)} />;
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 pb-24">
      <div className="flex items-center gap-3">
        {phase !== 'client' && (
          <Button type="button" variant="ghost" size="icon" onClick={goBack}>
            <ChevronLeft />
          </Button>
        )}
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Nueva orden de ingreso</h1>
          <p className="text-xs text-muted-foreground">
            Paso {currentStepIndex + 1} de {stepOrder.length}
          </p>
        </div>
      </div>

      <div className="flex gap-1">
        {stepOrder.map((s, i) => (
          <div
            key={s}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              i <= currentStepIndex ? 'bg-primary' : 'bg-muted',
            )}
          />
        ))}
      </div>

      {phase === 'client' && (
        <ClientStep
          documentId={documentId}
          setDocumentId={setDocumentId}
          searchStatus={searchStatus}
          runSearch={runSearch}
          foundClient={foundClient}
          isNewClient={isNewClient}
          newClient={newClient}
          setNewClient={setNewClient}
          selectedVehicleId={selectedVehicleId}
          setSelectedVehicleId={setSelectedVehicleId}
          wantsNewVehicle={wantsNewVehicle}
          setWantsNewVehicle={setWantsNewVehicle}
        />
      )}

      {phase === 'vehicle' && <VehicleStep newVehicle={newVehicle} setNewVehicle={setNewVehicle} />}

      {phase === 'services' && (
        <ServicesStep
          quickServices={quickServices ?? []}
          selectedServiceIds={selectedServiceIds}
          setSelectedServiceIds={setSelectedServiceIds}
          accessoryOptions={accessoryOptions ?? []}
          selectedAccessoryIds={selectedAccessoryIds}
          setSelectedAccessoryIds={setSelectedAccessoryIds}
          otherAccessoryChecked={otherAccessoryChecked}
          setOtherAccessoryChecked={setOtherAccessoryChecked}
          otherAccessoryText={otherAccessoryText}
          setOtherAccessoryText={setOtherAccessoryText}
          reason={reason}
          setReason={setReason}
        />
      )}

      {phase === 'photos' && (
        <PhotosStep photoSlots={photoSlots} setPhotoAt={setPhotoAt} addPhotoSlot={addPhotoSlot} />
      )}

      {phase === 'signature' && (
        <SignatureStep sigRef={sigRef} termsAccepted={termsAccepted} setTermsAccepted={setTermsAccepted} />
      )}

      <div className="fixed inset-x-0 bottom-0 border-t bg-background p-4">
        <div className="mx-auto max-w-lg">
          {phase === 'signature' ? (
            <Button className="h-12 w-full text-base" onClick={handleFinish} disabled={isSubmitting}>
              {isSubmitting ? 'Guardando orden...' : 'Finalizar orden'}
            </Button>
          ) : (
            <Button
              className="h-12 w-full text-base"
              onClick={goNext}
              disabled={
                (phase === 'client' && !clientStepValid) ||
                (phase === 'vehicle' && !vehicleStepValid) ||
                (phase === 'services' && !servicesStepValid)
              }
            >
              Siguiente
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ClientStep({
  documentId,
  setDocumentId,
  searchStatus,
  runSearch,
  foundClient,
  isNewClient,
  newClient,
  setNewClient,
  selectedVehicleId,
  setSelectedVehicleId,
  wantsNewVehicle,
  setWantsNewVehicle,
}: {
  documentId: string;
  setDocumentId: (v: string) => void;
  searchStatus: 'idle' | 'loading' | 'found' | 'not-found';
  runSearch: (doc: string) => void;
  foundClient: ClientLookupResult | null;
  isNewClient: boolean;
  newClient: { firstName: string; lastName: string; phone: string; email: string; address: string };
  setNewClient: React.Dispatch<React.SetStateAction<typeof newClient>>;
  selectedVehicleId: string;
  setSelectedVehicleId: (v: string) => void;
  wantsNewVehicle: boolean;
  setWantsNewVehicle: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Cédula del cliente</Label>
        <Input
          autoFocus
          inputMode="numeric"
          placeholder="Ej: 1020304050"
          className="h-12 text-lg"
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
          onBlur={() => runSearch(documentId.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') runSearch(documentId.trim());
          }}
        />
        {searchStatus === 'loading' && <p className="text-xs text-muted-foreground">Buscando...</p>}
      </div>

      {searchStatus === 'found' && foundClient && (
        <>
          <Card>
            <CardContent className="flex flex-col gap-1 text-sm">
              <p className="font-medium">
                {foundClient.firstName} {foundClient.lastName}
              </p>
              <p className="text-muted-foreground">{foundClient.phone ?? 'Sin teléfono'}</p>
            </CardContent>
          </Card>

          <p className="text-sm font-medium">Selecciona el vehículo</p>
          <div className="flex flex-col gap-2">
            {foundClient.motorcycles.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setSelectedVehicleId(m.id);
                  setWantsNewVehicle(false);
                }}
                className={cn(
                  'rounded-lg border p-4 text-left transition-colors',
                  selectedVehicleId === m.id ? 'border-primary bg-primary/5' : 'hover:bg-accent',
                )}
              >
                <p className="font-medium">
                  {m.brand} {m.model}
                </p>
                <p className="text-xs text-muted-foreground">
                  {VEHICLE_TYPE_LABELS[m.vehicleType]} {m.serialNumber ? `· ${m.serialNumber}` : ''}
                </p>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setWantsNewVehicle(true);
                setSelectedVehicleId('');
              }}
              className={cn(
                'rounded-lg border border-dashed p-4 text-left text-sm font-medium transition-colors',
                wantsNewVehicle ? 'border-primary bg-primary/5' : 'hover:bg-accent',
              )}
            >
              <Plus className="mr-1 inline size-4" /> Vehículo nuevo
            </button>
          </div>
        </>
      )}

      {searchStatus === 'not-found' && isNewClient && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Cliente nuevo — completa sus datos</p>
          <div className="flex flex-col gap-1.5">
            <Label>Nombre</Label>
            <Input
              value={newClient.firstName}
              onChange={(e) => setNewClient((prev) => ({ ...prev, firstName: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Apellido</Label>
            <Input
              value={newClient.lastName}
              onChange={(e) => setNewClient((prev) => ({ ...prev, lastName: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Teléfono</Label>
            <Input
              inputMode="tel"
              value={newClient.phone}
              onChange={(e) => setNewClient((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Correo (opcional)</Label>
            <Input
              type="email"
              value={newClient.email}
              onChange={(e) => setNewClient((prev) => ({ ...prev, email: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Dirección (opcional)</Label>
            <Input
              value={newClient.address}
              onChange={(e) => setNewClient((prev) => ({ ...prev, address: e.target.value }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function VehicleStep({
  newVehicle,
  setNewVehicle,
}: {
  newVehicle: {
    vehicleType: VehicleType;
    brand: string;
    model: string;
    color: string;
    purchaseDate: string;
    serialNumber: string;
  };
  setNewVehicle: React.Dispatch<React.SetStateAction<typeof newVehicle>>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>Tipo de vehículo</Label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(VEHICLE_TYPE_LABELS) as [VehicleType, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setNewVehicle((prev) => ({ ...prev, vehicleType: value }))}
              className={cn(
                'rounded-lg border p-3 text-sm font-medium transition-colors',
                newVehicle.vehicleType === value ? 'border-primary bg-primary/5' : 'hover:bg-accent',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Marca</Label>
        <Input value={newVehicle.brand} onChange={(e) => setNewVehicle((prev) => ({ ...prev, brand: e.target.value }))} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Modelo</Label>
        <Input value={newVehicle.model} onChange={(e) => setNewVehicle((prev) => ({ ...prev, model: e.target.value }))} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Color</Label>
        <Input value={newVehicle.color} onChange={(e) => setNewVehicle((prev) => ({ ...prev, color: e.target.value }))} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Fecha de compra</Label>
        <Input
          type="date"
          value={newVehicle.purchaseDate}
          onChange={(e) => setNewVehicle((prev) => ({ ...prev, purchaseDate: e.target.value }))}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Número serial del chasis</Label>
        <Input
          value={newVehicle.serialNumber}
          onChange={(e) => setNewVehicle((prev) => ({ ...prev, serialNumber: e.target.value }))}
        />
      </div>
    </div>
  );
}

function ServicesStep({
  quickServices,
  selectedServiceIds,
  setSelectedServiceIds,
  accessoryOptions,
  selectedAccessoryIds,
  setSelectedAccessoryIds,
  otherAccessoryChecked,
  setOtherAccessoryChecked,
  otherAccessoryText,
  setOtherAccessoryText,
  reason,
  setReason,
}: {
  quickServices: QuickService[];
  selectedServiceIds: string[];
  setSelectedServiceIds: React.Dispatch<React.SetStateAction<string[]>>;
  accessoryOptions: AccessoryOption[];
  selectedAccessoryIds: string[];
  setSelectedAccessoryIds: React.Dispatch<React.SetStateAction<string[]>>;
  otherAccessoryChecked: boolean;
  setOtherAccessoryChecked: (v: boolean) => void;
  otherAccessoryText: string;
  setOtherAccessoryText: (v: string) => void;
  reason: string;
  setReason: (v: string) => void;
}) {
  function toggleService(id: string) {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleAccessory(id: string) {
    setSelectedAccessoryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label>Servicios rápidos</Label>
        <div className="flex flex-wrap gap-2">
          {quickServices.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleService(s.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm transition-colors',
                selectedServiceIds.includes(s.id) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Accesorios entregados</Label>
        <div className="grid grid-cols-2 gap-2">
          {accessoryOptions.map((a) => (
            <label key={a.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
              <Checkbox checked={selectedAccessoryIds.includes(a.id)} onCheckedChange={() => toggleAccessory(a.id)} />
              {a.label}
            </label>
          ))}
          <label className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
            <Checkbox checked={otherAccessoryChecked} onCheckedChange={(v) => setOtherAccessoryChecked(Boolean(v))} />
            Otro
          </label>
        </div>
        {otherAccessoryChecked && (
          <Input
            placeholder="¿Cuál otro accesorio?"
            value={otherAccessoryText}
            onChange={(e) => setOtherAccessoryText(e.target.value)}
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>¿Qué reporta el cliente?</Label>
        <Textarea
          rows={4}
          placeholder="Ej: la moto perdió fuerza en las subidas y presenta un ruido en la parte trasera."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </div>
  );
}

function PhotosStep({
  photoSlots,
  setPhotoAt,
  addPhotoSlot,
}: {
  photoSlots: PhotoSlot[];
  setPhotoAt: (index: number, file: File | null) => void;
  addPhotoSlot: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">Toma fotos del vehículo (opcional, hasta {MAX_PHOTO_SLOTS}).</p>
      <div className="grid grid-cols-3 gap-3">
        {photoSlots.map((slot, i) => (
          <div key={i} className="relative aspect-square overflow-hidden rounded-lg border-2 border-dashed">
            {slot.preview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slot.preview} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoAt(i, null)}
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"
                >
                  <X className="size-3" />
                </button>
              </>
            ) : (
              <label className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-1 text-muted-foreground">
                <Camera className="size-6" />
                <span className="text-xs">Foto {i + 1}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => setPhotoAt(i, e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>
        ))}
      </div>
      {photoSlots.length < MAX_PHOTO_SLOTS && (
        <Button type="button" variant="outline" onClick={addPhotoSlot}>
          <Plus /> Agregar espacio
        </Button>
      )}
    </div>
  );
}

function SignatureStep({
  sigRef,
  termsAccepted,
  setTermsAccepted,
}: {
  sigRef: React.RefObject<SignatureCanvas | null>;
  termsAccepted: boolean;
  setTermsAccepted: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Label>Firma del cliente</Label>
      <div className="overflow-hidden rounded-lg border bg-white">
        <SignatureCanvas
          ref={sigRef}
          canvasProps={{ className: 'w-full h-48' }}
          penColor="black"
        />
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => sigRef.current?.clear()}>
        Borrar firma
      </Button>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={termsAccepted} onCheckedChange={(v) => setTermsAccepted(Boolean(v))} className="mt-0.5" />
        <span>
          El cliente ha leído y acepta los términos y condiciones del servicio: el taller no se hace responsable por
          objetos de valor dejados en el vehículo y el tiempo estimado de reparación puede variar según disponibilidad
          de repuestos.
        </span>
      </label>
    </div>
  );
}

function ConfirmationScreen({
  order,
  tenant,
  onDone,
}: {
  order: Order;
  tenant?: TenantMini;
  onDone: () => void;
}) {
  const formattedOrderNumber = formatOrderNumber(tenant?.orderPrefix ?? 'ORD', order.orderNumber);
  const trackingUrl = typeof window !== 'undefined' ? `${window.location.origin}/track/${order.trackingToken}` : '';
  const message = `Hola ${order.client?.firstName ?? ''}.
Hemos recibido correctamente tu vehículo en nuestro taller.

📋 Número de Orden: ${formattedOrderNumber}
🔐 Clave de salida: ${order.exitCode}

Esta clave será necesaria para retirar tu vehículo. Por favor, consérvala y no la compartas con terceros.

🔗 Consulta el estado de tu orden en cualquier momento aquí: ${trackingUrl}

Gracias por confiar en nosotros. Será un gusto atenderte.
Equipo ${tenant?.name ?? ''}`;

  async function handleNotifyEmail() {
    try {
      await api.post(`/orders/${order.id}/notify`, { channel: 'EMAIL' });
      toast.success('Correo enviado');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  function handleWhatsapp() {
    const phone = (order.client?.phone ?? '').replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(message);
    toast.success('Mensaje copiado');
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Check className="size-8" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Orden creada</p>
        <p className="text-3xl font-bold tracking-tight">{formattedOrderNumber}</p>
      </div>
      <Card className="w-full">
        <CardContent className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Clave de salida</p>
          <p className="text-2xl font-bold tracking-widest">{order.exitCode}</p>
        </CardContent>
      </Card>
      <p className="text-xs break-all text-muted-foreground">{trackingUrl}</p>

      <div className="grid w-full grid-cols-1 gap-2">
        <Button className="h-12" onClick={handleWhatsapp} disabled={!order.client?.phone}>
          <MessageCircle /> Enviar por WhatsApp
        </Button>
        <Button className="h-12" variant="outline" onClick={handleNotifyEmail} disabled={!order.client?.email}>
          <Mail /> Enviar por correo
        </Button>
        <Button className="h-12" variant="outline" onClick={handleCopy}>
          <Clipboard /> Copiar mensaje
        </Button>
      </div>

      <Button variant="ghost" onClick={onDone}>
        Ver la orden
      </Button>
    </div>
  );
}
