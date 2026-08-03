'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
  });
  const [isSaving, setIsSaving] = React.useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      await api.put(`/orders/${orderId}/diagnosis`, {
        description: form.description,
        faultFound: form.faultFound || undefined,
        testsPerformed: form.testsPerformed || undefined,
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
          <Label>Falla encontrada (opcional)</Label>
          <Textarea value={form.faultFound} onChange={(e) => setForm({ ...form, faultFound: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <Label>Pruebas realizadas (opcional)</Label>
          <Textarea
            value={form.testsPerformed}
            onChange={(e) => setForm({ ...form, testsPerformed: e.target.value })}
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
