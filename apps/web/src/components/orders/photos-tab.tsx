'use client';

import * as React from 'react';
import Image from 'next/image';
import { Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { api, API_ORIGIN } from '@/lib/api';
import { getErrorMessage, useAuth } from '@/components/providers/auth-provider';
import { PhotoCategory } from '@taller/shared';
import type { OrderPhoto } from '@/lib/types';

const CATEGORY_LABELS: Record<PhotoCategory, string> = {
  FRONT: 'Frontal',
  BACK: 'Trasera',
  LEFT_SIDE: 'Lateral izquierda',
  RIGHT_SIDE: 'Lateral derecha',
  DAMAGE: 'Daños',
  SERIAL_NUMBER: 'Número de serie',
  MOTOR: 'Motor',
  BATTERY: 'Batería',
  ACCESSORY: 'Accesorios',
  OTHER: 'Otra',
};

export function PhotosTab({
  orderId,
  photos,
  onUpdated,
}: {
  orderId: string;
  photos: OrderPhoto[];
  onUpdated: () => void;
}) {
  const [category, setCategory] = React.useState<PhotoCategory | undefined>(undefined);
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (category) formData.append('category', category);
      await api.upload(`/orders/${orderId}/photos`, formData);
      toast.success('Foto subida');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const { user } = useAuth();
  const canUpload =
    user?.role === 'ADMIN' ||
    user?.role === 'MANAGER' ||
    user?.role === 'TECHNICIAN';

  const intakePhotos = photos.filter((p) => p.stage === 'INTAKE');
  const workPhotos = photos.filter((p) => p.stage === 'WORK');

  async function handleDelete(photoId: string) {
    try {
      await api.delete(`/orders/${orderId}/photos/${photoId}`);
      toast.success('Foto eliminada');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="font-medium">Fotos de ingreso</h3>
          <p className="text-sm text-muted-foreground">
            Cómo se recibió el vehículo. Este registro no se modifica.
          </p>
        </div>
        <PhotoGrid
          photos={intakePhotos}
          emptyText="No se tomaron fotos al recibir el vehículo."
        />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="font-medium">Evidencia del trabajo</h3>
          <p className="text-sm text-muted-foreground">
            Fotos del trabajo realizado por el técnico.
          </p>
        </div>

        {canUpload && (
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as PhotoCategory)}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Sin categoría (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload /> {isUploading ? 'Subiendo...' : 'Subir foto'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        <PhotoGrid
          photos={workPhotos}
          emptyText="Aún no hay evidencia del trabajo."
          onDelete={canUpload ? handleDelete : undefined}
        />
      </section>
    </div>
  );
}

function PhotoGrid({
  photos,
  emptyText,
  onDelete,
}: {
  photos: OrderPhoto[];
  emptyText: string;
  onDelete?: (photoId: string) => void;
}) {
  if (photos.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo) => (
        <div key={photo.id} className="flex flex-col gap-2">
          <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
            <Image
              src={
                photo.url.startsWith('http')
                  ? photo.url
                  : `${API_ORIGIN}${photo.url}`
              }
              alt={
                photo.category
                  ? CATEGORY_LABELS[photo.category]
                  : 'Foto de la orden'
              }
              fill
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Badge variant="secondary" className="w-fit">
              {photo.category ? CATEGORY_LABELS[photo.category] : 'Sin categoría'}
            </Badge>
            {onDelete && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(photo.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
