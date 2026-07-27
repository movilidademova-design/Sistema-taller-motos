'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { DiagnosisParts } from './diagnosis-parts';
import type { Diagnosis } from '@/lib/types';

export function DiagnosisTab({
  orderId,
  diagnosis,
  onUpdated,
}: {
  orderId: string;
  diagnosis: Diagnosis | null | undefined;
  onUpdated: () => void;
}) {
  const [form, setForm] = React.useState({
    description: diagnosis?.description ?? '',
    faultFound: diagnosis?.faultFound ?? '',
    testsPerformed: diagnosis?.testsPerformed ?? '',
    batteryVoltage: diagnosis?.batteryVoltage ?? '',
    controllerStatus: diagnosis?.controllerStatus ?? '',
    motorStatus: diagnosis?.motorStatus ?? '',
    observations: diagnosis?.observations ?? '',
    estimatedTimeHours: diagnosis?.estimatedTimeHours ?? '',
    estimatedCost: diagnosis?.estimatedCost ?? '',
  });
  const [isSaving, setIsSaving] = React.useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      await api.put(`/orders/${orderId}/diagnosis`, {
        description: form.description,
        faultFound: form.faultFound,
        testsPerformed: form.testsPerformed || undefined,
        batteryVoltage: form.batteryVoltage || undefined,
        controllerStatus: form.controllerStatus || undefined,
        motorStatus: form.motorStatus || undefined,
        observations: form.observations || undefined,
        estimatedTimeHours: form.estimatedTimeHours ? Number(form.estimatedTimeHours) : undefined,
        estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : undefined,
      });
      toast.success('Diagnóstico guardado');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label>Descripción técnica</Label>
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label>Falla encontrada</Label>
          <Textarea value={form.faultFound} onChange={(e) => setForm({ ...form, faultFound: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label>Pruebas realizadas</Label>
          <Textarea
            value={form.testsPerformed}
            onChange={(e) => setForm({ ...form, testsPerformed: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Voltaje de batería</Label>
          <Input
            value={form.batteryVoltage}
            onChange={(e) => setForm({ ...form, batteryVoltage: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Estado del controlador</Label>
          <Input
            value={form.controllerStatus}
            onChange={(e) => setForm({ ...form, controllerStatus: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Estado del motor</Label>
          <Input value={form.motorStatus} onChange={(e) => setForm({ ...form, motorStatus: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Tiempo estimado (horas)</Label>
          <Input
            type="number"
            value={form.estimatedTimeHours}
            onChange={(e) => setForm({ ...form, estimatedTimeHours: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label>Costo estimado</Label>
          <Input
            type="number"
            value={form.estimatedCost}
            onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label>Observaciones</Label>
          <Textarea
            value={form.observations}
            onChange={(e) => setForm({ ...form, observations: e.target.value })}
          />
        </div>
      </div>

      <DiagnosisParts orderId={orderId} parts={diagnosis?.requiredParts ?? []} onUpdated={onUpdated} />

      <div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Guardando...' : 'Guardar diagnóstico'}
        </Button>
      </div>
    </div>
  );
}
