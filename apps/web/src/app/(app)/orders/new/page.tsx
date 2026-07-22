'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { QuickServiceChips } from '@/components/orders/quick-service-chips';
import { PhotoCaptureGrid } from '@/components/orders/photo-capture-grid';
import { SignaturePad, type SignaturePadHandle } from '@/components/orders/signature-pad';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api, ApiError } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { VehicleType, VEHICLE_TYPE_LABELS } from '@taller/shared';
import type { Client, Motorcycle, Order, QuickService } from '@/lib/types';

type Step = 'client' | 'vehicle' | 'reason' | 'photos' | 'signature' | 'done';
const STEP_ORDER: Step[] = ['client', 'vehicle', 'reason', 'photos', 'signature', 'done'];
const STEP_LABELS: Record<Step, string> = {
  client: 'Cliente',
  vehicle: 'Vehículo',
  reason: 'Motivo',
  photos: 'Fotos',
  signature: 'Firma',
  done: 'Listo',
};

interface NewClientForm {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
}

interface NewVehicleForm {
  vehicleType: VehicleType;
  brand: string;
  model: string;
  color: string;
  purchaseDate: string;
  serialNumber: string;
}

interface IntakeResult {
  order: Order;
  message: string;
  whatsappPhone: string | null;
}

export default function NewOrderWizardPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>('client');

  const [documentId, setDocumentId] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const [foundClient, setFoundClient] = React.useState<(Client & { motorcycles: Motorcycle[] }) | null>(
    null,
  );
  const [searchedOnce, setSearchedOnce] = React.useState(false);
  const [newClientForm, setNewClientForm] = React.useState<NewClientForm>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
  });

  const [selectedMotorcycleId, setSelectedMotorcycleId] = React.useState('');
  const [isNewVehicle, setIsNewVehicle] = React.useState(false);
  const [newVehicleForm, setNewVehicleForm] = React.useState<NewVehicleForm>({
    vehicleType: VehicleType.MOTO,
    brand: '',
    model: '',
    color: '',
    purchaseDate: '',
    serialNumber: '',
  });

  const { data: quickServices } = useApiSWR<QuickService[]>('/quick-services');
  const { data: tenant } = useApiSWR<{ name: string }>('/tenant/settings');
  const [selectedQuickServiceIds, setSelectedQuickServiceIds] = React.useState<string[]>([]);
  const [description, setDescription] = React.useState('');

  const [photos, setPhotos] = React.useState<File[]>([]);
  const signatureRef = React.useRef<SignaturePadHandle>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<IntakeResult | null>(null);

  async function handleSearchClient() {
    setIsSearching(true);
    try {
      const client = await api.get<Client & { motorcycles: Motorcycle[] }>(
        `/clients/by-document/${encodeURIComponent(documentId)}`,
      );
      setFoundClient(client);
      setSearchedOnce(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setFoundClient(null);
        setSearchedOnce(true);
      } else {
        toast.error(getErrorMessage(error));
      }
    } finally {
      setIsSearching(false);
    }
  }

  const clientStepValid = foundClient
    ? true
    : searchedOnce && newClientForm.firstName.trim() !== '' && newClientForm.lastName.trim() !== '';

  function goNext() {
    const index = STEP_ORDER.indexOf(step);
    setStep(STEP_ORDER[Math.min(index + 1, STEP_ORDER.length - 1)]);
  }

  function goBack() {
    const index = STEP_ORDER.indexOf(step);
    setStep(STEP_ORDER[Math.max(index - 1, 0)]);
  }

  async function handleSubmit() {
    if (signatureRef.current?.isEmpty()) {
      toast.error('Falta la firma del cliente');
      return;
    }
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      if (foundClient) {
        formData.append('clientId', foundClient.id);
      } else {
        formData.append(
          'newClient',
          JSON.stringify({ documentId, ...newClientForm }),
        );
      }
      const usingExistingVehicle =
        !isNewVehicle && !!foundClient && foundClient.motorcycles.length > 0;
      if (usingExistingVehicle) {
        formData.append('motorcycleId', selectedMotorcycleId);
      } else {
        formData.append('newMotorcycle', JSON.stringify(newVehicleForm));
      }
      if (selectedQuickServiceIds.length) {
        formData.append('quickServiceIds', JSON.stringify(selectedQuickServiceIds));
      }
      formData.append('description', description);
      photos.forEach((file) => formData.append('photos', file));
      const signatureBlob = await signatureRef.current?.toBlob();
      if (signatureBlob) formData.append('signature', signatureBlob, 'signature.png');

      const order = await api.upload<Order>('/orders/intake', formData);
      const message = buildIntakeMessage({
        firstName: order.client?.firstName ?? '',
        orderNumber: order.orderNumber,
        pickupCode: order.pickupCode ?? '',
        tenantName: tenant?.name ?? '',
      });
      setResult({
        order,
        message,
        whatsappPhone: order.client?.phone ? order.client.phone.replace(/\D/g, '') : null,
      });
      setStep('done');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendEmail(orderId: string) {
    try {
      await api.post(`/orders/${orderId}/send-intake-message`);
      toast.success('Correo enviado');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push('/orders')}>
          <ArrowLeft className="size-4" /> Cancelar
        </Button>
        <span className="text-sm text-muted-foreground">
          Paso {STEP_ORDER.indexOf(step) + 1} de {STEP_ORDER.length}: {STEP_LABELS[step]}
        </span>
      </div>

      {step === 'client' && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex flex-col gap-1.5">
              <Label>Cédula del cliente</Label>
              <div className="flex gap-2">
                <Input
                  value={documentId}
                  onChange={(e) => {
                    setDocumentId(e.target.value);
                    setFoundClient(null);
                    setSearchedOnce(false);
                    setSelectedMotorcycleId('');
                    setIsNewVehicle(false);
                  }}
                  placeholder="1020304050"
                />
                <Button
                  type="button"
                  onClick={handleSearchClient}
                  disabled={isSearching || !documentId.trim()}
                >
                  <Search className="size-4" /> Buscar
                </Button>
              </div>
            </div>

            {foundClient && (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {foundClient.firstName} {foundClient.lastName}
                </p>
                <p className="text-muted-foreground">{foundClient.phone ?? 'Sin teléfono'}</p>
              </div>
            )}

            {searchedOnce && !foundClient && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  No encontramos un cliente con esa cédula. Regístralo:
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label>Nombre completo</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nombre"
                      value={newClientForm.firstName}
                      onChange={(e) =>
                        setNewClientForm({ ...newClientForm, firstName: e.target.value })
                      }
                    />
                    <Input
                      placeholder="Apellido"
                      value={newClientForm.lastName}
                      onChange={(e) =>
                        setNewClientForm({ ...newClientForm, lastName: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Teléfono</Label>
                  <Input
                    value={newClientForm.phone}
                    onChange={(e) => setNewClientForm({ ...newClientForm, phone: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Correo</Label>
                  <Input
                    type="email"
                    value={newClientForm.email}
                    onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Dirección</Label>
                  <Input
                    value={newClientForm.address}
                    onChange={(e) => setNewClientForm({ ...newClientForm, address: e.target.value })}
                  />
                </div>
              </div>
            )}

            <Button onClick={goNext} disabled={!clientStepValid} className="mt-2">
              Siguiente <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 'vehicle' && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            {foundClient && foundClient.motorcycles.length > 0 && !isNewVehicle && (
              <div className="flex flex-col gap-1.5">
                <Label>Selecciona el vehículo</Label>
                <Select value={selectedMotorcycleId} onValueChange={setSelectedMotorcycleId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Elige un vehículo" />
                  </SelectTrigger>
                  <SelectContent>
                    {foundClient.motorcycles.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.brand} {m.model} {m.serialNumber ? `(${m.serialNumber})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="link" className="w-fit px-0" onClick={() => setIsNewVehicle(true)}>
                  + Vehículo nuevo
                </Button>
              </div>
            )}

            {(isNewVehicle || !foundClient || foundClient.motorcycles.length === 0) && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Tipo de vehículo</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setNewVehicleForm({ ...newVehicleForm, vehicleType: value as VehicleType })
                        }
                        className={`rounded-lg border p-3 text-sm ${
                          newVehicleForm.vehicleType === value
                            ? 'border-primary bg-primary text-primary-foreground'
                            : ''
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label>Marca</Label>
                    <Input
                      value={newVehicleForm.brand}
                      onChange={(e) => setNewVehicleForm({ ...newVehicleForm, brand: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label>Modelo</Label>
                    <Input
                      value={newVehicleForm.model}
                      onChange={(e) => setNewVehicleForm({ ...newVehicleForm, model: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Color</Label>
                  <Input
                    value={newVehicleForm.color}
                    onChange={(e) => setNewVehicleForm({ ...newVehicleForm, color: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Fecha de compra</Label>
                  <Input
                    type="date"
                    value={newVehicleForm.purchaseDate}
                    onChange={(e) =>
                      setNewVehicleForm({ ...newVehicleForm, purchaseDate: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Número serial del chasis</Label>
                  <Input
                    value={newVehicleForm.serialNumber}
                    onChange={(e) =>
                      setNewVehicleForm({ ...newVehicleForm, serialNumber: e.target.value })
                    }
                  />
                </div>
                {foundClient && foundClient.motorcycles.length > 0 && (
                  <Button type="button" variant="link" className="w-fit px-0" onClick={() => setIsNewVehicle(false)}>
                    Usar un vehículo existente
                  </Button>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="size-4" /> Atrás
              </Button>
              <Button
                className="flex-1"
                onClick={goNext}
                disabled={
                  isNewVehicle || !foundClient || foundClient.motorcycles.length === 0
                    ? !newVehicleForm.brand || !newVehicleForm.model
                    : !selectedMotorcycleId
                }
              >
                Siguiente <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'reason' && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex flex-col gap-1.5">
              <Label>Servicios rápidos</Label>
              <QuickServiceChips
                services={quickServices ?? []}
                selectedIds={selectedQuickServiceIds}
                onToggle={(id) =>
                  setSelectedQuickServiceIds((prev) =>
                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                  )
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Descripción del cliente</Label>
              <Textarea
                rows={4}
                placeholder="Ej: la moto perdió fuerza en las subidas..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="size-4" /> Atrás
              </Button>
              <Button
                className="flex-1"
                onClick={goNext}
                disabled={!description.trim() && selectedQuickServiceIds.length === 0}
              >
                Siguiente <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'photos' && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <Label>Fotos del vehículo (hasta 10)</Label>
            <PhotoCaptureGrid files={photos} onChange={setPhotos} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="size-4" /> Atrás
              </Button>
              <Button className="flex-1" onClick={goNext}>
                Siguiente <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'signature' && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <Label>Firma del cliente</Label>
            <SignaturePad ref={signatureRef} />
            <p className="text-xs text-muted-foreground">
              Al firmar, el cliente acepta los términos y condiciones del servicio de recepción
              y reparación de este taller.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={goBack} disabled={isSubmitting}>
                <ArrowLeft className="size-4" /> Atrás
              </Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Creando orden...' : 'Confirmar y crear orden'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'done' && result && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 text-center">
            <div>
              <p className="text-sm text-muted-foreground">Número de orden</p>
              <p className="text-3xl font-bold">#{result.order.orderNumber}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Clave de salida</p>
              <p className="text-3xl font-bold tracking-widest">{result.order.pickupCode}</p>
            </div>
            <div className="flex flex-col gap-2">
              {result.whatsappPhone && (
                <Button
                  onClick={() =>
                    window.open(
                      `https://wa.me/${result.whatsappPhone}?text=${encodeURIComponent(result.message)}`,
                      '_blank',
                    )
                  }
                >
                  Enviar por WhatsApp
                </Button>
              )}
              {result.order.client?.email && (
                <Button variant="outline" onClick={() => void handleSendEmail(result.order.id)}>
                  Enviar por correo
                </Button>
              )}
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(result.message);
                  toast.success('Mensaje copiado');
                }}
              >
                Copiar mensaje
              </Button>
              <Button variant="ghost" onClick={() => router.push(`/orders/${result.order.id}`)}>
                Ver la orden
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function buildIntakeMessage(data: {
  firstName: string;
  orderNumber: number;
  pickupCode: string;
  tenantName: string;
}) {
  return [
    `Hola ${data.firstName}.`,
    'Hemos recibido correctamente tu vehículo en nuestro taller.',
    `📋 Número de Orden: ${data.orderNumber}`,
    `🔐 Clave de salida: ${data.pickupCode}`,
    'Esta clave será necesaria para retirar tu vehículo. Por favor, consérvala y no la compartas con terceros.',
    'Puedes utilizar el número de orden para realizar consultas sobre el estado de la reparación.',
    'Gracias por confiar en nosotros. Será un gusto atenderte.',
    `Equipo ${data.tenantName}`,
  ].join('\n');
}
