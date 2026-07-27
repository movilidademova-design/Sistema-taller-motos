# Diagnosis Parts Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a técnico add a repuesto to an order's Diagnóstico either by searching the existing inventory (instant stock deduction) or as a free-text "repuesto libre" (no inventory link), replacing the current bulk-replace-on-save parts list with immediate per-item add/remove.

**Architecture:** Add an `observations` field to the existing `DiagnosisPart` model. Replace the bulk `requiredParts` handling inside `DiagnosisService.upsert`/`UpsertDiagnosisDto` with two new endpoints (`POST .../diagnosis/parts`, `DELETE .../diagnosis/parts/:partId`) that mutate one row at a time, decrementing/restoring `Product.quantity` + logging an `InventoryMovement` when the part is inventory-linked. Split the frontend's parts UI out of the existing `DiagnosisTab` into a new `DiagnosisParts` component built around a reusable inventory-search popover.

**Tech Stack:** NestJS + Prisma 7 (backend), Next.js 16 App Router (frontend) — mirrors the existing `ProductsService.adjustStock` pattern for stock math and the existing `AccessoryOption`/`QuickService` per-item CRUD pattern for immediate add/remove UX, both already shipped in this codebase.

---

## Task 1: Prisma schema + migration (`observations` on `DiagnosisPart`)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the field**

In `model DiagnosisPart` (search for it), add `observations` right after `unitCost`:

```prisma
model DiagnosisPart {
  id           String     @id @default(uuid())
  diagnosisId  String
  diagnosis    Diagnosis  @relation(fields: [diagnosisId], references: [id], onDelete: Cascade)
  productId    String?
  product      Product?   @relation(fields: [productId], references: [id], onDelete: SetNull)
  description  String
  quantity     Int        @default(1)
  unitCost     Decimal    @db.Decimal(10, 2)
  observations String?

  @@map("diagnosis_parts")
}
```

- [ ] **Step 2: Generate and run the migration**

```bash
pnpm --filter @taller/api exec prisma migrate dev --name diagnosis_part_observations
```

Expected: migration succeeds, adds the nullable `observations` column, regenerates the Prisma client.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "Add observations field to DiagnosisPart"
```

---

## Task 2: Backend — remove bulk `requiredParts` handling

**Files:**
- Modify: `apps/api/src/orders/diagnosis/dto/upsert-diagnosis.dto.ts`
- Modify: `apps/api/src/orders/diagnosis/diagnosis.service.ts`

This must happen before the new per-item endpoints exist, so there is never a window where both the bulk-replace path and the incremental path are active at once — the bulk-replace path silently deletes inventory-linked parts without reversing their stock deduction, which would be a real inventory bug if left in place alongside Task 3/4's new endpoints.

- [ ] **Step 1: Remove `requiredParts` from the DTO**

In `apps/api/src/orders/diagnosis/dto/upsert-diagnosis.dto.ts`, delete the entire `DiagnosisPartDto` class and the `requiredParts` field from `UpsertDiagnosisDto`:

Remove this class entirely:
```ts
export class DiagnosisPartDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitCost: number;
}
```

Remove this field from `UpsertDiagnosisDto`:
```ts
  @ApiProperty({ type: [DiagnosisPartDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DiagnosisPartDto)
  requiredParts?: DiagnosisPartDto[];
```

After these removals, `IsArray`, `IsUUID`, and `ValidateNested` become unused imports in this file — remove them from the `import` statement too, leaving:
```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
```
(`Type` from `class-transformer` also becomes unused — remove that whole import line.)

- [ ] **Step 2: Simplify `DiagnosisService.upsert`**

In `apps/api/src/orders/diagnosis/diagnosis.service.ts`, replace the `upsert` method:

```ts
  async upsert(
    tenantId: string,
    orderId: string,
    technicianId: string,
    dto: UpsertDiagnosisDto,
  ) {
    await this.ordersService.assertOrderExists(tenantId, orderId);

    const diagnosis = await this.prisma.diagnosis.upsert({
      where: { orderId },
      create: { orderId, technicianId, ...dto },
      update: dto,
    });

    return this.prisma.diagnosis.findUniqueOrThrow({
      where: { id: diagnosis.id },
      include: { requiredParts: true },
    });
  }
```

(This removes the destructuring of `requiredParts` and the `deleteMany`/`createMany` block — the rest of the diagnosis fields still upsert exactly as before. The `$transaction` wrapper is no longer needed since there's only one write.)

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @taller/api build
```
Expected: succeeds with no errors (confirms no other file still references `DiagnosisPartDto` or `requiredParts` on the DTO).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/orders/diagnosis/dto/upsert-diagnosis.dto.ts apps/api/src/orders/diagnosis/diagnosis.service.ts
git commit -m "Remove bulk requiredParts replace from diagnosis upsert"
```

---

## Task 3: Backend — `POST /orders/:orderId/diagnosis/parts` (add, with inventory deduction)

**Files:**
- Create: `apps/api/src/orders/diagnosis/dto/add-diagnosis-part.dto.ts`
- Modify: `apps/api/src/orders/diagnosis/diagnosis.service.ts`
- Modify: `apps/api/src/orders/diagnosis/diagnosis.controller.ts`

- [x] **Step 1: DTO**

```ts
// apps/api/src/orders/diagnosis/dto/add-diagnosis-part.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class AddDiagnosisPartDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  observations?: string;
}
```

- [x] **Step 2: Service method**

In `apps/api/src/orders/diagnosis/diagnosis.service.ts`, add the import at the top:

```ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMovementType } from '../../generated/prisma/enums';
import { AddDiagnosisPartDto } from './dto/add-diagnosis-part.dto';
```

(Replace the existing `import { Injectable, NotFoundException } from '@nestjs/common';` line with the three-import version above, and add the two new imports alongside the existing ones.)

Add this method after `upsert`:

```ts
  async addPart(
    tenantId: string,
    orderId: string,
    technicianId: string,
    dto: AddDiagnosisPartDto,
  ) {
    const order = await this.ordersService.assertOrderExists(tenantId, orderId);

    let diagnosis = await this.prisma.diagnosis.findUnique({
      where: { orderId },
    });
    if (!diagnosis) {
      diagnosis = await this.prisma.diagnosis.create({
        data: { orderId, technicianId, description: '', faultFound: '' },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      let unitCost = 0;

      if (dto.productId) {
        const product = await tx.product.findFirst({
          where: { id: dto.productId, tenantId },
        });
        if (!product) throw new NotFoundException('Producto no encontrado');
        const newQuantity = product.quantity - dto.quantity;
        if (newQuantity < 0) {
          throw new BadRequestException('No hay suficiente stock disponible');
        }
        await tx.product.update({
          where: { id: product.id },
          data: { quantity: newQuantity },
        });
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId: product.id,
            orderId,
            type: InventoryMovementType.SALE_OUT,
            quantity: dto.quantity,
            reason: `Usado en diagnóstico — orden #${order.orderNumber}`,
            createdById: technicianId,
          },
        });
        unitCost = Number(product.unitCost);
      }

      return tx.diagnosisPart.create({
        data: {
          diagnosisId: diagnosis.id,
          productId: dto.productId,
          description: dto.description,
          quantity: dto.quantity,
          unitCost,
          observations: dto.observations,
        },
      });
    });
  }
```

- [x] **Step 3: Controller endpoint**

In `apps/api/src/orders/diagnosis/diagnosis.controller.ts`, add the import:

```ts
import { AddDiagnosisPartDto } from './dto/add-diagnosis-part.dto';
```

Add this method after `upsert`:

```ts
  @Roles(Role.ADMIN, Role.MANAGER, Role.TECHNICIAN)
  @Audit('Diagnosis')
  @Post('parts')
  addPart(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('orderId') orderId: string,
    @Body() dto: AddDiagnosisPartDto,
  ) {
    return this.diagnosisService.addPart(tenantId, orderId, userId, dto);
  }
```

Add `Post` to the existing `@nestjs/common` import line (currently `import { Body, Controller, Get, Param, Put } from '@nestjs/common';`):
```ts
import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
```

- [x] **Step 4: Verify build**

```bash
pnpm --filter @taller/api build
```
Expected: succeeds with no errors.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/orders/diagnosis/dto/add-diagnosis-part.dto.ts apps/api/src/orders/diagnosis/diagnosis.service.ts apps/api/src/orders/diagnosis/diagnosis.controller.ts
git commit -m "Add POST /orders/:orderId/diagnosis/parts with inventory deduction"
```

**Post-review fix (commit `ba4cac6`):** code review found the empty-`Diagnosis` auto-create ran OUTSIDE the `$transaction` used for stock deduction + part creation, so a failed add (e.g. insufficient stock) left an orphaned empty `Diagnosis` row permanently attributed to whichever técnico's failed attempt created it. Fixed by moving the auto-create inside the same transaction (`tx.diagnosis.*` instead of `this.prisma.diagnosis.*`), so a thrown error rolls back the whole thing. Also changed `AddDiagnosisPartDto.quantity`'s validator from `@IsNumber()` to `@IsInt()`, since both `Product.quantity` and `DiagnosisPart.quantity` are integer columns. The TOCTOU race in the stock read-check-write (mirrors an existing pattern in `ProductsService.adjustStock`) was flagged but left as a follow-up item, not fixed here — out of scope for this task.

---

## Task 4: Backend — `DELETE /orders/:orderId/diagnosis/parts/:partId` (remove, with stock restoration)

**Files:**
- Modify: `apps/api/src/orders/diagnosis/diagnosis.service.ts`
- Modify: `apps/api/src/orders/diagnosis/diagnosis.controller.ts`

- [x] **Step 1: Service method**

Add this method to `apps/api/src/orders/diagnosis/diagnosis.service.ts`, after `addPart`:

```ts
  async removePart(
    tenantId: string,
    orderId: string,
    partId: string,
    userId: string,
  ) {
    const order = await this.ordersService.assertOrderExists(tenantId, orderId);
    const part = await this.prisma.diagnosisPart.findFirst({
      where: { id: partId, diagnosis: { orderId } },
    });
    if (!part) throw new NotFoundException('Repuesto no encontrado');

    await this.prisma.$transaction(async (tx) => {
      if (part.productId) {
        const product = await tx.product.findUnique({
          where: { id: part.productId },
        });
        if (product) {
          await tx.product.update({
            where: { id: product.id },
            data: { quantity: product.quantity + part.quantity },
          });
          await tx.inventoryMovement.create({
            data: {
              tenantId,
              productId: part.productId,
              orderId,
              type: InventoryMovementType.ADJUSTMENT_IN,
              quantity: part.quantity,
              reason: `Reversión — repuesto eliminado de orden #${order.orderNumber}`,
              createdById: userId,
            },
          });
        }
      }
      await tx.diagnosisPart.delete({ where: { id: partId } });
    });

    return { success: true };
  }
```

- [x] **Step 2: Controller endpoint**

Add to `apps/api/src/orders/diagnosis/diagnosis.controller.ts`, after `addPart`:

```ts
  @Roles(Role.ADMIN, Role.MANAGER, Role.TECHNICIAN)
  @Audit('Diagnosis')
  @Delete('parts/:partId')
  removePart(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('orderId') orderId: string,
    @Param('partId') partId: string,
  ) {
    return this.diagnosisService.removePart(tenantId, orderId, partId, userId);
  }
```

Add `Delete` to the `@nestjs/common` import line:
```ts
import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
```

- [x] **Step 3: Verify build**

```bash
pnpm --filter @taller/api build
```
Expected: succeeds with no errors.

- [x] **Step 4: Commit**

```bash
git add apps/api/src/orders/diagnosis/diagnosis.service.ts apps/api/src/orders/diagnosis/diagnosis.controller.ts
git commit -m "Add DELETE /orders/:orderId/diagnosis/parts/:partId with stock restoration"
```

**Post-review fix (commit `bf4b7a2`):** code review found the product re-lookup used `tx.product.findUnique({ where: { id: part.productId } })` with no `tenantId` filter, unlike `addPart`'s tenant-scoped query — not exploitable today (since `part.productId` can only hold a value already tenant-validated when the part was added), but an inconsistency/defense-in-depth gap. Fixed to `tx.product.findFirst({ where: { id: part.productId, tenantId } })`, matching `addPart`'s pattern.

---

## Task 5: Frontend — types

**Files:**
- Modify: `apps/web/src/lib/types.ts`

- [ ] **Step 1: Add `observations` to `DiagnosisPart`**

Find the `DiagnosisPart` interface and add the new field:

```ts
export interface DiagnosisPart {
  id: string;
  productId?: string | null;
  description: string;
  quantity: number;
  unitCost: string;
  observations?: string | null;
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm --filter @taller/web build
```
Expected: succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/types.ts
git commit -m "Add observations to DiagnosisPart frontend type"
```

---

## Task 6: Frontend — reusable inventory search popover

**Files:**
- Create: `apps/web/src/components/orders/inventory-part-search.tsx`

- [x] **Step 1: Create the component**

```tsx
// apps/web/src/components/orders/inventory-part-search.tsx
'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useApiSWR } from '@/hooks/use-api-swr';
import type { PaginatedResult, Product } from '@/lib/types';

export function InventoryPartSearch({ onSelect }: { onSelect: (product: Product) => void }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const { data, isLoading } = useApiSWR<PaginatedResult<Product>>(
    open && debouncedQuery.trim()
      ? `/inventory/products?search=${encodeURIComponent(debouncedQuery)}&pageSize=10`
      : null,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Search className="size-4" /> Buscar en inventario
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <Input
          autoFocus
          placeholder="Nombre, SKU o código..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
          {isLoading && <p className="p-2 text-sm text-muted-foreground">Buscando...</p>}
          {!isLoading && debouncedQuery.trim() !== '' && data?.items.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">Sin resultados</p>
          )}
          {data?.items.map((product) => (
            <button
              key={product.id}
              type="button"
              className="flex flex-col rounded-md p-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                onSelect(product);
                setOpen(false);
                setQuery('');
              }}
            >
              <span className="font-medium">{product.name}</span>
              <span className="text-xs text-muted-foreground">
                SKU: {product.sku} — Stock: {product.quantity}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [x] **Step 2: Verify build**

```bash
pnpm --filter @taller/web build
```
Expected: succeeds (component isn't used yet, just confirms no syntax/type error).

- [x] **Step 3: Commit**

```bash
git add apps/web/src/components/orders/inventory-part-search.tsx
git commit -m "Add reusable inventory product search popover"
```

**Post-review fixes (commits `b899d9f`, `3507ce7`):** code review found the result list was Tab-only with no arrow-key navigation, no listbox semantics, and no highlighted-row indicator — worth fixing before this component gets reused in Task 7. Added `ArrowUp`/`ArrowDown`/`Enter` handling with wrap-around, `combobox`/`listbox`/`option` ARIA roles, and a highlighted-row style. A follow-up re-review then caught that the highlight-reset effect was keyed on `items.length` (so a same-sized-but-different result set wouldn't reset it) — fixed by keying on `debouncedQuery` instead. See the actual committed code, not the snippet above, as the source of truth for this task.

---

## Task 7: Frontend — `DiagnosisParts` component + wire into `DiagnosisTab`

**Files:**
- Create: `apps/web/src/components/orders/diagnosis-parts.tsx`
- Modify: `apps/web/src/components/orders/diagnosis-tab.tsx`

- [x] **Step 1: Create the new parts component**

```tsx
// apps/web/src/components/orders/diagnosis-parts.tsx
'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { InventoryPartSearch } from './inventory-part-search';
import type { DiagnosisPart, Product } from '@/lib/types';

export function DiagnosisParts({
  orderId,
  parts,
  onUpdated,
}: {
  orderId: string;
  parts: DiagnosisPart[];
  onUpdated: () => void;
}) {
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);
  const [inventoryQuantity, setInventoryQuantity] = React.useState('1');
  const [freeMode, setFreeMode] = React.useState(false);
  const [freeDescription, setFreeDescription] = React.useState('');
  const [freeQuantity, setFreeQuantity] = React.useState('1');
  const [freeObservations, setFreeObservations] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  async function handleAddInventoryPart() {
    if (!selectedProduct) return;
    setIsSubmitting(true);
    try {
      await api.post(`/orders/${orderId}/diagnosis/parts`, {
        productId: selectedProduct.id,
        description: selectedProduct.name,
        quantity: Number(inventoryQuantity),
      });
      toast.success('Repuesto agregado');
      setSelectedProduct(null);
      setInventoryQuantity('1');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddFreePart() {
    setIsSubmitting(true);
    try {
      await api.post(`/orders/${orderId}/diagnosis/parts`, {
        description: freeDescription,
        quantity: Number(freeQuantity),
        observations: freeObservations || undefined,
      });
      toast.success('Repuesto agregado');
      setFreeMode(false);
      setFreeDescription('');
      setFreeQuantity('1');
      setFreeObservations('');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(partId: string) {
    setRemovingId(partId);
    try {
      await api.delete(`/orders/${orderId}/diagnosis/parts/${partId}`);
      toast.success('Repuesto eliminado');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Label>Repuestos requeridos</Label>

      {parts.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin repuestos agregados</p>
      )}
      {parts.map((part) => (
        <div key={part.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
          <div className="flex flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-medium">{part.description}</span>
              <Badge variant={part.productId ? 'default' : 'secondary'}>
                {part.productId ? 'Inventario' : 'Repuesto libre'}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">Cantidad: {part.quantity}</span>
            {part.observations && (
              <span className="text-xs text-muted-foreground">{part.observations}</span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={removingId === part.id}
            onClick={() => handleRemove(part.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
        {!selectedProduct && !freeMode && (
          <div className="flex flex-wrap gap-2">
            <InventoryPartSearch onSelect={setSelectedProduct} />
            <Button type="button" variant="outline" size="sm" onClick={() => setFreeMode(true)}>
              <Plus className="size-4" /> Repuesto libre
            </Button>
          </div>
        )}

        {selectedProduct && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Repuesto</Label>
              <p className="text-sm font-medium">{selectedProduct.name}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Cantidad</Label>
              <Input
                type="number"
                min={1}
                className="w-24"
                value={inventoryQuantity}
                onChange={(e) => setInventoryQuantity(e.target.value)}
              />
            </div>
            <Button type="button" size="sm" disabled={isSubmitting} onClick={handleAddInventoryPart}>
              {isSubmitting ? 'Agregando...' : 'Agregar'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedProduct(null)}>
              Cancelar
            </Button>
          </div>
        )}

        {freeMode && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Nombre</Label>
                <Input value={freeDescription} onChange={(e) => setFreeDescription(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Cantidad</Label>
                <Input
                  type="number"
                  min={1}
                  className="w-24"
                  value={freeQuantity}
                  onChange={(e) => setFreeQuantity(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Observaciones (opcional)</Label>
              <Input value={freeObservations} onChange={(e) => setFreeObservations(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={isSubmitting || !freeDescription.trim()}
                onClick={handleAddFreePart}
              >
                {isSubmitting ? 'Agregando...' : 'Agregar'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setFreeMode(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [x] **Step 2: Wire it into `DiagnosisTab`, removing the old bulk parts UI**

In `apps/web/src/components/orders/diagnosis-tab.tsx`:

Remove the `PartDraft` interface, the `parts` state, and the `addPart`/`updatePart`/`removePart` functions entirely (lines 14-18 and 40-59 of the current file).

Add this import:
```ts
import { DiagnosisParts } from './diagnosis-parts';
```

In `handleSave`, remove the `requiredParts: parts.filter((p) => p.description),` line from the PUT body — the request body becomes just the plain diagnosis fields, nothing part-related.

Replace the entire "Repuestos requeridos" block (the `<div className="flex flex-col gap-2">...</div>` containing the `Label`, "Agregar" button, and `parts.map(...)`) with:

```tsx
      <DiagnosisParts orderId={orderId} parts={diagnosis?.requiredParts ?? []} onUpdated={onUpdated} />
```

- [x] **Step 3: Verify build**

```bash
pnpm --filter @taller/web build
```
Expected: succeeds with no errors.

- [x] **Step 4: Commit**

```bash
git add apps/web/src/components/orders/diagnosis-parts.tsx apps/web/src/components/orders/diagnosis-tab.tsx
git commit -m "Replace bulk-save parts list with per-item inventory-aware add/remove"
```

---

## Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full backend build + tests**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: both succeed with no errors (no new automated tests were added in this plan — see Testing note in the design spec — so the existing suite count/results should be unchanged from before this feature).

- [ ] **Step 2: Full frontend build**

```bash
pnpm --filter @taller/web build
```
Expected: succeeds with no errors.

- [ ] **Step 3: Manual smoke test**

With both dev servers running (`pnpm --filter @taller/api start:dev`, `pnpm --filter @taller/web dev`):
- [ ] Log in as `admin@tallerdemo.com` / `Password123!`.
- [ ] Note the current stock quantity of an existing inventory product (Configuración → Inventario, or the Inventario page).
- [ ] Open an order's Diagnóstico tab, use "Buscar en inventario", search for that product by name, select it, set a quantity, click "Agregar" — confirm it appears in the list tagged "Inventario", and that the product's stock in Inventario decreased by exactly that quantity.
- [ ] Click "Repuesto libre", fill in a name/quantity/observations, click "Agregar" — confirm it appears in the list tagged "Repuesto libre", and that no inventory product's stock changed.
- [ ] Delete the inventory-linked repuesto from the list — confirm the product's stock in Inventario is restored to its original quantity.
- [ ] Delete the repuesto libre — confirm it disappears with no inventory side effect.
- [ ] Edit an unrelated field in the rest of the Diagnóstico form (e.g. "Falla encontrada") and click "Guardar diagnóstico" — confirm any remaining repuestos in the list are NOT affected (not duplicated, not removed).
- [ ] Try adding an inventory part with a quantity greater than current stock — confirm a clear error message and no partial state change (no row added, no stock changed).

- [ ] **Step 4: Final commit (only if the manual pass required fixes)**

```bash
git add -A
git commit -m "Fix issues found during manual verification of diagnosis parts inventory"
```
