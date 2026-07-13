'use client';

import * as React from 'react';
import Image from 'next/image';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { api, API_ORIGIN } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
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
  const [category, setCategory] = React.useState<PhotoCategory>(PhotoCategory.FRONT);
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={category} onValueChange={(v) => setCategory(v as PhotoCategory)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
          <Upload /> {isUploading ? 'Subiendo...' : 'Subir foto'}
        </Button>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      </div>

      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no se han subido fotografías.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <div key={photo.id} className="flex flex-col gap-2">
              <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                <Image
                  src={photo.url.startsWith('http') ? photo.url : `${API_ORIGIN}${photo.url}`}
                  alt={CATEGORY_LABELS[photo.category]}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <Badge variant="secondary" className="w-fit">
                {CATEGORY_LABELS[photo.category]}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
