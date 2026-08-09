'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, downloadFile } from '@/lib/api';
import { getErrorMessage, useAuth } from '@/components/providers/auth-provider';

interface ImportError {
  row: number;
  message: string;
}

interface ImportPreview {
  toCreate: number;
  toUpdate: number;
  errors: ImportError[];
}

interface ImportResult {
  created: number;
  updated: number;
}

// Pantalla de tres pasos: descargar la plantilla (que ES la exportación de
// inventario), elegir el archivo editado y ver la previsualización, y
// confirmar. La previsualización es obligatoria — nunca se aplica un
// archivo sin haberlo visto antes.
export default function ImportarProductosPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isAdmin = user?.posRole === 'ADMIN';

  const [isDownloading, setIsDownloading] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [isApplying, setIsApplying] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (user && !isAdmin) router.replace('/pos/productos');
  }, [user, isAdmin, router]);

  if (!isAdmin) return null;

  async function handleDownloadTemplate() {
    setIsDownloading(true);
    try {
      await downloadFile('/pos/products/export', 'plantilla-productos.xlsx');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setResult(null);
    setPreview(null);
    setFile(selected);
    setIsPreviewing(true);
    try {
      const formData = new FormData();
      formData.append('file', selected);
      const data = await api.upload<ImportPreview>('/pos/products/import/preview', formData);
      setPreview(data);
    } catch (error) {
      toast.error(getErrorMessage(error));
      setFile(null);
    } finally {
      setIsPreviewing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleApply() {
    if (!file || !preview || preview.errors.length > 0) return;
    setIsApplying(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await api.upload<ImportResult>('/pos/products/import', formData);
      setResult(data);
      toast.success('Inventario importado');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsApplying(false);
    }
  }

  function handleImportAnother() {
    setFile(null);
    setPreview(null);
    setResult(null);
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/pos/productos"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-4" /> Productos
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Importar inventario desde Excel
        </h1>
        <p className="text-sm text-muted-foreground">
          Carga varios productos de una vez, o actualiza precios y stock en bloque.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Descarga la plantilla</CardTitle>
          <CardDescription>
            Es el mismo archivo que exporta el inventario actual de esta sucursal: bájalo,
            edítalo en Excel — agrega filas nuevas o cambia precio, costo y stock de las que ya
            existen — y vuelve a subirlo aquí.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleDownloadTemplate} disabled={isDownloading}>
            <Download /> {isDownloading ? 'Descargando...' : 'Descargar plantilla'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Elige el archivo editado</CardTitle>
          <CardDescription>
            Importante: <strong>el stock del archivo reemplaza al del sistema</strong>, no se
            suma. E <strong>importar nunca da de baja productos</strong> — lo que ya existe y no
            está en el archivo se queda como está.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <Button onClick={() => fileInputRef.current?.click()} disabled={isPreviewing}>
              <Upload /> {isPreviewing ? 'Analizando...' : 'Elegir archivo'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={handleFileChange}
            />
            {file && <p className="mt-2 text-sm text-muted-foreground">Archivo: {file.name}</p>}
          </div>

          {preview && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="success">{preview.toCreate} nuevos</Badge>
                <Badge variant="secondary">{preview.toUpdate} se actualizan</Badge>
                {preview.errors.length > 0 && (
                  <Badge variant="destructive">{preview.errors.length} con error</Badge>
                )}
              </div>

              {preview.errors.length > 0 && (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Fila</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.errors.map((error, i) => (
                        <TableRow key={i}>
                          <TableCell>{error.row}</TableCell>
                          <TableCell className="text-sm">{error.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {preview && !result && (
        <Card>
          <CardHeader>
            <CardTitle>3. Confirmar</CardTitle>
            <CardDescription>
              {preview.errors.length > 0
                ? 'Corrige las filas con error en el Excel y vuelve a elegir el archivo. Con errores no se puede aplicar.'
                : `Se crearán ${preview.toCreate} productos y se actualizarán ${preview.toUpdate}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleApply}
              disabled={preview.errors.length > 0 || isApplying}
            >
              {isApplying ? 'Aplicando...' : 'Confirmar importación'}
            </Button>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-success" /> Importación completa
            </CardTitle>
            <CardDescription>
              {result.created} productos creados, {result.updated} actualizados.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Link href="/pos/productos">
              <Button>Volver a productos</Button>
            </Link>
            <Button variant="outline" onClick={handleImportAnother}>
              Importar otro archivo
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
