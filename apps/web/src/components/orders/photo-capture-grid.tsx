'use client';

import * as React from 'react';
import { Camera, Plus, X } from 'lucide-react';

const MIN_SLOTS = 6;
const MAX_PHOTOS = 10;

export function PhotoCaptureGrid({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const urlsRef = React.useRef(new Map<File, string>());
  const canAddMore = files.length < MAX_PHOTOS;
  const emptySlots = Math.max(0, MIN_SLOTS - files.length - (canAddMore ? 1 : 0));

  React.useEffect(() => {
    const current = new Set(files);
    for (const [file, url] of urlsRef.current) {
      if (!current.has(file)) {
        URL.revokeObjectURL(url);
        urlsRef.current.delete(file);
      }
    }
  }, [files]);

  React.useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  function getObjectUrl(file: File) {
    let url = urlsRef.current.get(file);
    if (!url) {
      url = URL.createObjectURL(file);
      urlsRef.current.set(file, url);
    }
    return url;
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && files.length < MAX_PHOTOS) {
      onChange([...files, file]);
    }
    e.target.value = '';
  }

  function handleRemove(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {files.map((file, index) => (
        <div key={index} className="relative aspect-square overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getObjectUrl(file)}
            alt={`Foto ${index + 1}`}
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={() => handleRemove(index)}
            aria-label={`Eliminar foto ${index + 1}`}
            className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      {canAddMore && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground"
        >
          {files.length === 0 ? <Camera className="size-5" /> : <Plus className="size-5" />}
          <span className="text-xs">Agregar foto</span>
        </button>
      )}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <div key={`empty-${i}`} className="aspect-square rounded-lg border border-dashed opacity-40" />
      ))}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelected}
      />
    </div>
  );
}
