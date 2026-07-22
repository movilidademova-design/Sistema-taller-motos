'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toBlob: () => Promise<Blob | null>;
}

export const SignaturePad = React.forwardRef<SignaturePadHandle, { className?: string }>(
  function SignaturePad({ className }, ref) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const drawingRef = React.useRef(false);
    const hasDrawnRef = React.useRef(false);
    const lastPointRef = React.useRef<{ x: number; y: number } | null>(null);

    React.useImperativeHandle(ref, () => ({
      isEmpty: () => !hasDrawnRef.current,
      toBlob: () =>
        new Promise((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas) return resolve(null);
          canvas.toBlob((blob) => resolve(blob), 'image/png');
        }),
    }));

    function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * canvas.width,
        y: ((e.clientY - rect.top) / rect.height) * canvas.height,
      };
    }

    function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      e.currentTarget.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      lastPointRef.current = getPoint(e);
    }

    function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !lastPointRef.current) return;
      const point = getPoint(e);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      lastPointRef.current = point;
      hasDrawnRef.current = true;
    }

    function handlePointerUp() {
      drawingRef.current = false;
      lastPointRef.current = null;
    }

    function handleClear() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawnRef.current = false;
    }

    return (
      <div className={className}>
        <canvas
          ref={canvasRef}
          width={600}
          height={240}
          aria-label="Área para firmar con el dedo, mouse o lápiz óptico"
          className="w-full touch-none rounded-lg border bg-white aspect-[5/2]"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={handleClear}>
          Borrar firma
        </Button>
      </div>
    );
  },
);
