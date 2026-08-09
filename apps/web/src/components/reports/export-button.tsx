'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { downloadFile } from '@/lib/api';
import { getErrorMessage, useAuth } from '@/components/providers/auth-provider';

export function ExportButton({
  endpoint,
  filename,
  params = {},
  label = 'Exportar a Excel',
  hint,
  visible,
}: {
  endpoint: string;
  /** Nombre de respaldo si el servidor no manda Content-Disposition. */
  filename: string;
  params?: Record<string, string | undefined>;
  label?: string;
  /** Aviso al pasar el mouse, para cuando el archivo no trae exactamente lo que se ve en pantalla. */
  hint?: string;
  /**
   * Anula el chequeo de rol por defecto (taller: ADMIN/MANAGER). El POS usa
   * `posRole`, un campo distinto — sus páginas pasan aquí su propio cálculo
   * (p. ej. `user?.posRole === 'ADMIN'`) en vez de depender del rol del taller.
   */
  visible?: boolean;
}) {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = React.useState(false);

  // Exportar datos es una operación administrativa: recepción y técnicos no la ven.
  const canExport = visible ?? (user?.role === 'ADMIN' || user?.role === 'MANAGER');
  if (!canExport) return null;

  async function handleExport() {
    setIsExporting(true);
    try {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value) search.set(key, value);
      }
      const queryString = search.toString();
      await downloadFile(
        queryString ? `${endpoint}?${queryString}` : endpoint,
        `${filename}.xlsx`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isExporting}
      title={hint}
    >
      <Download /> {isExporting ? 'Exportando...' : label}
    </Button>
  );
}
