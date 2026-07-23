# Intake Wizard Quick Fixes (Group A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-configurable "accessories delivered" checklist to the order intake wizard, fix the WhatsApp share link to include the Colombian country code, and make the orders list rows clickable.

**Architecture:** A new `AccessoryOption` catalog (tenant-scoped, admin-managed) mirrors the existing `QuickService` pattern exactly — same CRUD/reorder shape, same admin panel structure — kept as a deliberately separate, parallel system rather than generalizing `QuickService`, to avoid touching an already-shipped feature. The wizard gets a new step between "Vehículo" and "Motivo"; selections are combined server-side into the existing (already-rendered) `Order.accessoriesDelivered` field, the same way quick-service tags are combined into `reason`.

**Tech Stack:** NestJS 11 + Prisma 7 (backend), Next.js 16 + SWR + Radix UI (frontend) — same stack as the rest of the project, no new dependencies.

---

## Reference spec

Full design: `docs/superpowers/specs/2026-07-23-intake-wizard-quick-fixes-design.md`

## Task order

1. Prisma schema + migration (`AccessoryOption`)
2. Backend: `AccessoryOptions` module (CRUD + reorder)
3. Backend: `buildAccessoriesText` pure utility (TDD)
4. Backend: wire accessories into `IntakeOrderDto` + `OrdersService.intake()`
5. Frontend: shared types (`AccessoryOption`) + `toWhatsappPhone` utility
6. Frontend: `AccessoryChecklist` component
7. Frontend: Settings — "Accesorios" admin tab
8. Frontend: wizard — accessories step + WhatsApp phone fix
9. Frontend: clickable order rows
10. Final verification

---

### Task 1: Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the `AccessoryOption` model**

In `apps/api/prisma/schema.prisma`, add this new model right after `model QuickService { ... }` closes (before `model User`):

```prisma
model AccessoryOption {
  id        String   @id @default(uuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  label     String
  position  Int      @default(0)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  @@unique([tenantId, label])
  @@index([tenantId])
  @@map("accessory_options")
}
```

- [ ] **Step 2: Add the inverse relation to `Tenant`**

In `model Tenant`, add this line right next to `quickServices QuickService[]`:

```prisma
  accessoryOptions   AccessoryOption[]
```

- [ ] **Step 3: Create and apply the migration**

Run:
```bash
pnpm --filter @taller/api exec prisma migrate dev --name accessory_options
```
Expected: `Applying migration ...accessory_options` → `Your database is now in sync with your schema.` (This is a purely additive migration — new table, no existing data affected — so no backfill/`--create-only` step is needed here, unlike the earlier `order_intake_module` migration.)

- [ ] **Step 4: Regenerate the Prisma client**

Run:
```bash
pnpm --filter @taller/api prisma:generate
```
Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma
git commit -m "Add AccessoryOption model for admin-configurable accessories checklist"
```

---

### Task 2: Backend — `AccessoryOptions` module

**Files:**
- Create: `apps/api/src/accessory-options/dto/create-accessory-option.dto.ts`
- Create: `apps/api/src/accessory-options/dto/update-accessory-option.dto.ts`
- Create: `apps/api/src/accessory-options/dto/reorder-accessory-options.dto.ts`
- Create: `apps/api/src/accessory-options/accessory-options.service.ts`
- Create: `apps/api/src/accessory-options/accessory-options.controller.ts`
- Create: `apps/api/src/accessory-options/accessory-options.module.ts`
- Modify: `apps/api/src/app.module.ts`

This module is a structural copy of `apps/api/src/quick-services/` (already built, reviewed, and fixed in an earlier phase of this project) — same CRUD/reorder shape, same RBAC, same duplicate-label 409 handling, same tenant-ownership check on reorder. Applying those same fixes from the start here avoids repeating an already-learned review round.

- [ ] **Step 1: Create the DTOs**

`apps/api/src/accessory-options/dto/create-accessory-option.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateAccessoryOptionDto {
  @ApiProperty({ example: 'Casco' })
  @IsString()
  @MinLength(1)
  label: string;
}
```

`apps/api/src/accessory-options/dto/update-accessory-option.dto.ts`:
```ts
import { PartialType } from '@nestjs/swagger';
import { CreateAccessoryOptionDto } from './create-accessory-option.dto';

export class UpdateAccessoryOptionDto extends PartialType(CreateAccessoryOptionDto) {}
```

`apps/api/src/accessory-options/dto/reorder-accessory-options.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class ReorderAccessoryOptionsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  orderedIds: string[];
}
```

- [ ] **Step 2: Create the service**

`apps/api/src/accessory-options/accessory-options.service.ts`:
```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccessoryOptionDto } from './dto/create-accessory-option.dto';
import { UpdateAccessoryOptionDto } from './dto/update-accessory-option.dto';
import { ReorderAccessoryOptionsDto } from './dto/reorder-accessory-options.dto';

@Injectable()
export class AccessoryOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.accessoryOption.findMany({
      where: { tenantId, isActive: true },
      orderBy: { position: 'asc' },
    });
  }

  async create(tenantId: string, dto: CreateAccessoryOptionDto) {
    const existing = await this.prisma.accessoryOption.findFirst({
      where: { tenantId, label: dto.label },
    });
    if (existing) {
      throw new ConflictException('Ya existe un accesorio con ese nombre');
    }
    const last = await this.prisma.accessoryOption.findFirst({
      where: { tenantId },
      orderBy: { position: 'desc' },
    });
    return this.prisma.accessoryOption.create({
      data: { tenantId, label: dto.label, position: (last?.position ?? -1) + 1 },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateAccessoryOptionDto) {
    await this.assertExists(tenantId, id);
    if (dto.label) {
      const existing = await this.prisma.accessoryOption.findFirst({
        where: { tenantId, label: dto.label, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException('Ya existe un accesorio con ese nombre');
      }
    }
    return this.prisma.accessoryOption.update({ where: { id }, data: dto });
  }

  async remove(tenantId: string, id: string) {
    await this.assertExists(tenantId, id);
    return this.prisma.accessoryOption.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async reorder(tenantId: string, dto: ReorderAccessoryOptionsDto) {
    const owned = await this.prisma.accessoryOption.findMany({
      where: { tenantId, id: { in: dto.orderedIds } },
      select: { id: true },
    });
    if (owned.length !== dto.orderedIds.length) {
      throw new NotFoundException('Algún accesorio no pertenece a este taller');
    }
    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.accessoryOption.update({
          where: { id },
          data: { position: index },
        }),
      ),
    );
    return this.findAll(tenantId);
  }

  private async assertExists(tenantId: string, id: string) {
    const option = await this.prisma.accessoryOption.findFirst({
      where: { id, tenantId },
    });
    if (!option) throw new NotFoundException('Accesorio no encontrado');
    return option;
  }
}
```

- [ ] **Step 3: Create the controller**

`apps/api/src/accessory-options/accessory-options.controller.ts`:
```ts
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessoryOptionsService } from './accessory-options.service';
import { CreateAccessoryOptionDto } from './dto/create-accessory-option.dto';
import { UpdateAccessoryOptionDto } from './dto/update-accessory-option.dto';
import { ReorderAccessoryOptionsDto } from './dto/reorder-accessory-options.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('accessory-options')
@Controller('accessory-options')
export class AccessoryOptionsController {
  constructor(private readonly accessoryOptionsService: AccessoryOptionsService) {}

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.accessoryOptionsService.findAll(tenantId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('AccessoryOption')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateAccessoryOptionDto,
  ) {
    return this.accessoryOptionsService.create(tenantId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('AccessoryOption')
  @Patch('reorder')
  reorder(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ReorderAccessoryOptionsDto,
  ) {
    return this.accessoryOptionsService.reorder(tenantId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('AccessoryOption')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAccessoryOptionDto,
  ) {
    return this.accessoryOptionsService.update(tenantId, id, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('AccessoryOption')
  @Delete(':id')
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.accessoryOptionsService.remove(tenantId, id);
  }
}
```

Note: `@Patch('reorder')` is declared before `@Patch(':id')` so it is not swallowed by the parameterized route (same reasoning as `quick-services`, even though the two paths have different segment counts and wouldn't actually collide — kept for consistency with the sibling module).

- [ ] **Step 4: Create the module**

`apps/api/src/accessory-options/accessory-options.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AccessoryOptionsService } from './accessory-options.service';
import { AccessoryOptionsController } from './accessory-options.controller';

@Module({
  controllers: [AccessoryOptionsController],
  providers: [AccessoryOptionsService],
  exports: [AccessoryOptionsService],
})
export class AccessoryOptionsModule {}
```

- [ ] **Step 5: Register the module in `app.module.ts`**

Add the import:
```ts
import { AccessoryOptionsModule } from './accessory-options/accessory-options.module';
```

Add `AccessoryOptionsModule` to the `imports` array, right after `QuickServicesModule`.

- [ ] **Step 6: Verify it builds**

Run: `pnpm --filter @taller/api build`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/accessory-options apps/api/src/app.module.ts
git commit -m "Add AccessoryOptions module with CRUD and reordering"
```

---

### Task 3: Backend — `buildAccessoriesText` pure utility (TDD)

**Files:**
- Create: `apps/api/src/orders/intake-accessories.util.ts`
- Test: `apps/api/src/orders/intake-accessories.util.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { buildAccessoriesText } from './intake-accessories.util';

describe('buildAccessoriesText', () => {
  it('joins checked accessory labels and the free-text "otro" field', () => {
    expect(buildAccessoriesText(['Llaves', 'Casco'], 'candado de disco')).toBe(
      'Llaves, Casco, candado de disco',
    );
  });

  it('works with only checked labels', () => {
    expect(buildAccessoriesText(['Llaves', 'Cargador'], '')).toBe('Llaves, Cargador');
  });

  it('works with only the "otro" text', () => {
    expect(buildAccessoriesText([], 'silla para bebé')).toBe('silla para bebé');
  });

  it('returns undefined when nothing was provided', () => {
    expect(buildAccessoriesText([], '')).toBeUndefined();
    expect(buildAccessoriesText([], '   ')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @taller/api test intake-accessories.util`
Expected: FAIL — `Cannot find module './intake-accessories.util'`

- [ ] **Step 3: Implement `buildAccessoriesText`**

```ts
/** Combines the labels of checked accessory checkboxes with the free-text "otro" field. */
export function buildAccessoriesText(labels: string[], otherText: string): string | undefined {
  const combined = [labels.join(', '), otherText.trim()].filter((part) => part !== '').join(', ');
  return combined === '' ? undefined : combined;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @taller/api test intake-accessories.util`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/orders/intake-accessories.util.ts apps/api/src/orders/intake-accessories.util.spec.ts
git commit -m "Add accessories text combining utility"
```

---

### Task 4: Backend — wire accessories into intake

**Files:**
- Modify: `apps/api/src/orders/dto/intake-order.dto.ts`
- Modify: `apps/api/src/orders/orders.service.ts`

- [ ] **Step 1: Add `accessoryOptionIds` and `otherAccessoryText` to `IntakeOrderDto`**

In `apps/api/src/orders/dto/intake-order.dto.ts`, add these two fields to the `IntakeOrderDto` class, right after the `quickServiceIds` field and before `description`:

```ts
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @Transform(({ value }) => parseIfJsonString(value, 'accessoryOptionIds'))
  accessoryOptionIds?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  otherAccessoryText?: string;
```

(No new imports are needed — `IsArray`, `IsOptional`, `IsString`, `IsUUID`, `Transform`, and `parseIfJsonString` are already imported/defined in this file.)

- [ ] **Step 2: Import `buildAccessoriesText` in `orders.service.ts`**

Add this import to `apps/api/src/orders/orders.service.ts`, right after the `buildIntakeReason` import:

```ts
import { buildAccessoriesText } from './intake-accessories.util';
```

- [ ] **Step 3: Resolve accessory labels and combine them inside the `intake()` transaction**

In `apps/api/src/orders/orders.service.ts`, inside the `intake()` method's `$transaction`, right after the existing `reason` is computed (after the `const reason = buildIntakeReason(...)` line, before `const tenant = await tx.tenant.update(...)`), add:

```ts
      const accessoryOptions = dto.accessoryOptionIds?.length
        ? await tx.accessoryOption.findMany({
            where: { id: { in: dto.accessoryOptionIds }, tenantId },
          })
        : [];
      const accessoriesDelivered = buildAccessoriesText(
        accessoryOptions.map((a) => a.label),
        dto.otherAccessoryText ?? '',
      );
```

- [ ] **Step 4: Persist `accessoriesDelivered` on the created order**

Still inside `intake()`, in the `tx.order.create({ data: { ... } })` call, add `accessoriesDelivered,` right after the `reason,` line:

```ts
      const created = await tx.order.create({
        data: {
          tenantId,
          orderNumber: tenant.nextOrderNumber - 1,
          clientId: client.id,
          motorcycleId: motorcycle.id,
          receptionistId,
          reason,
          accessoriesDelivered,
          status: OrderStatus.RECEIVED,
          pickupCode,
          signatureUrl,
          signedAt: new Date(),
          photos: { create: photoUrls.map((url) => ({ url })) },
        },
      });
```

- [ ] **Step 5: Verify it builds**

Run: `pnpm --filter @taller/api build`
Expected: no TypeScript errors.

- [ ] **Step 6: Verify the full backend test suite still passes**

Run: `pnpm --filter @taller/api test`
Expected: all suites pass, including the new `intake-accessories.util.spec.ts`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/orders/dto/intake-order.dto.ts apps/api/src/orders/orders.service.ts
git commit -m "Wire accessory checklist into order intake"
```

---

### Task 5: Frontend — shared types + WhatsApp phone utility

**Files:**
- Modify: `apps/web/src/lib/types.ts`
- Create: `apps/web/src/lib/phone.ts`

- [ ] **Step 1: Add the `AccessoryOption` interface**

In `apps/web/src/lib/types.ts`, add this new interface right after the existing `QuickService` interface:

```ts
export interface AccessoryOption {
  id: string;
  label: string;
  position: number;
  isActive: boolean;
  createdAt: string;
}
```

- [ ] **Step 2: Create the WhatsApp phone normalizer**

`apps/web/src/lib/phone.ts`:
```ts
/**
 * Normalizes a stored phone number into the digits-only format wa.me expects.
 * A bare 10-digit Colombian mobile number (e.g. "3105551234") is missing its
 * country code — without it, WhatsApp misreads the leading digits as an
 * invalid country code and reports the number as nonexistent. Numbers that
 * already carry a country code (any other digit count, or one already
 * starting with "57") are passed through unchanged.
 * Assumes Colombia (this workshop is single-tenant/single-country, no
 * country selector) — a foreign 10-digit number starting with "3", or a
 * Colombian landline (which won't start with "3"), won't be handled correctly.
 */
export function toWhatsappPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  return digits;
}
```

- [ ] **Step 3: Verify it builds**

Run: `pnpm --filter @taller/web build`
Expected: no TypeScript/ESLint errors (neither symbol is consumed yet — that happens in Tasks 7 and 8 — so this step just checks syntax).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/lib/phone.ts
git commit -m "Add AccessoryOption type and WhatsApp phone normalizer"
```

---

### Task 6: Frontend — `AccessoryChecklist` component

**Files:**
- Create: `apps/web/src/components/orders/accessory-checklist.tsx`

- [ ] **Step 1: Implement the component**

```tsx
'use client';

import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AccessoryOption } from '@/lib/types';

export function AccessoryChecklist({
  options,
  selectedIds,
  onToggle,
  otherChecked,
  onOtherCheckedChange,
  otherText,
  onOtherTextChange,
}: {
  options: AccessoryOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  otherChecked: boolean;
  onOtherCheckedChange: (checked: boolean) => void;
  otherText: string;
  onOtherTextChange: (value: string) => void;
}) {
  const otherTextId = React.useId();

  return (
    <div className="flex flex-col gap-3">
      {options.map((option) => (
        <Label key={option.id} className="font-normal">
          <Checkbox
            checked={selectedIds.includes(option.id)}
            onCheckedChange={() => onToggle(option.id)}
          />
          {option.label}
        </Label>
      ))}
      <Label className="font-normal">
        <Checkbox
          checked={otherChecked}
          onCheckedChange={(checked) => onOtherCheckedChange(checked === true)}
        />
        Otro
      </Label>
      {otherChecked && (
        <div className="flex flex-col gap-1.5 pl-6">
          <Label htmlFor={otherTextId} className="text-xs text-muted-foreground">
            Especifica cuál
          </Label>
          <Input
            id={otherTextId}
            value={otherText}
            onChange={(e) => onOtherTextChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm --filter @taller/web build`
Expected: no TypeScript/ESLint errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/orders/accessory-checklist.tsx
git commit -m "Add accessory checklist component"
```

---

### Task 7: Frontend — Settings "Accesorios" admin tab

**Files:**
- Modify: `apps/web/src/app/(app)/settings/page.tsx`

This mirrors the existing "Servicios rápidos" tab exactly (`QuickServicesSettings`/`QuickServiceForm`), including the error-handling and reorder-guard fixes already applied there.

- [ ] **Step 1: Add `AccessoryOption` to the types import**

Change:
```ts
import type { QuickService, UserSummary } from '@/lib/types';
```
to:
```ts
import type { AccessoryOption, QuickService, UserSummary } from '@/lib/types';
```

- [ ] **Step 2: Add the new tab trigger and content**

In `SettingsPage`, add a fourth `TabsTrigger` right after `quick-services`:
```tsx
          <TabsTrigger value="accessories">Accesorios</TabsTrigger>
```

And add a matching `TabsContent` right after the `quick-services` one:
```tsx
        <TabsContent value="accessories">
          <AccessoryOptionsSettings />
        </TabsContent>
```

- [ ] **Step 3: Add `AccessoryOptionsSettings` and `AccessoryOptionForm`**

Add these at the end of the file (after `QuickServiceForm`):

```tsx
function AccessoryOptionsSettings() {
  const { data: options, mutate } = useApiSWR<AccessoryOption[]>('/accessory-options');
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AccessoryOption | null>(null);
  const [isReordering, setIsReordering] = React.useState(false);

  async function handleMove(index: number, direction: -1 | 1) {
    if (!options || isReordering) return;
    const next = [...options];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setIsReordering(true);
    try {
      await api.patch('/accessory-options/reorder', { orderedIds: next.map((o) => o.id) });
      mutate();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsReordering(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/accessory-options/${id}`);
      mutate();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setEditing(null)}>
              <Plus /> Nuevo accesorio
            </Button>
          </DialogTrigger>
          <DialogContent>
            <AccessoryOptionForm
              editing={editing}
              onSuccess={() => {
                setOpen(false);
                setEditing(null);
                mutate();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex flex-col gap-2">
        {options?.map((option, index) => (
          <div key={option.id} className="flex items-center gap-2 rounded-lg border p-2">
            <div className="flex flex-col">
              <button
                type="button"
                disabled={index === 0 || isReordering}
                onClick={() => handleMove(index, -1)}
                aria-label="Mover arriba"
                className="disabled:opacity-30"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                disabled={index === options.length - 1 || isReordering}
                onClick={() => handleMove(index, 1)}
                aria-label="Mover abajo"
                className="disabled:opacity-30"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
            <span className="flex-1 text-sm">{option.label}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(option);
                setOpen(true);
              }}
            >
              Editar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleDelete(option.id)}>
              Eliminar
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccessoryOptionForm({
  editing,
  onSuccess,
}: {
  editing: AccessoryOption | null;
  onSuccess: () => void;
}) {
  const [label, setLabel] = React.useState(editing?.label ?? '');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editing) {
        await api.patch(`/accessory-options/${editing.id}`, { label });
      } else {
        await api.post('/accessory-options', { label });
      }
      toast.success('Guardado');
      onSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{editing ? 'Editar accesorio' : 'Nuevo accesorio'}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-1.5 py-4">
        <Label>Nombre</Label>
        <Input required value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || !label}>
          {isSubmitting ? 'Guardando...' : 'Guardar'}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 4: Verify it builds**

Run: `pnpm --filter @taller/web build`
Expected: no TypeScript/ESLint errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/settings/page.tsx"
git commit -m "Add accessories admin panel to Settings"
```

---

### Task 8: Frontend — wizard accessories step + WhatsApp phone fix

**Files:**
- Modify: `apps/web/src/app/(app)/orders/new/page.tsx`

- [ ] **Step 1: Add imports**

Add `AccessoryChecklist` and `toWhatsappPhone` imports, and add `AccessoryOption` to the existing types import. Change:

```tsx
import { QuickServiceChips } from '@/components/orders/quick-service-chips';
import { PhotoCaptureGrid } from '@/components/orders/photo-capture-grid';
import { SignaturePad, type SignaturePadHandle } from '@/components/orders/signature-pad';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api, ApiError } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { VehicleType, VEHICLE_TYPE_LABELS } from '@taller/shared';
import type { Client, Motorcycle, Order, QuickService } from '@/lib/types';
```
to:
```tsx
import { AccessoryChecklist } from '@/components/orders/accessory-checklist';
import { QuickServiceChips } from '@/components/orders/quick-service-chips';
import { PhotoCaptureGrid } from '@/components/orders/photo-capture-grid';
import { SignaturePad, type SignaturePadHandle } from '@/components/orders/signature-pad';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api, ApiError } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { toWhatsappPhone } from '@/lib/phone';
import { VehicleType, VEHICLE_TYPE_LABELS } from '@taller/shared';
import type { AccessoryOption, Client, Motorcycle, Order, QuickService } from '@/lib/types';
```

- [ ] **Step 2: Add `'accessories'` to the step type and labels**

Change:
```tsx
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
```
to:
```tsx
type Step = 'client' | 'vehicle' | 'accessories' | 'reason' | 'photos' | 'signature' | 'done';
const STEP_ORDER: Step[] = ['client', 'vehicle', 'accessories', 'reason', 'photos', 'signature', 'done'];
const STEP_LABELS: Record<Step, string> = {
  client: 'Cliente',
  vehicle: 'Vehículo',
  accessories: 'Accesorios',
  reason: 'Motivo',
  photos: 'Fotos',
  signature: 'Firma',
  done: 'Listo',
};
```

- [ ] **Step 3: Add accessories state and fetch the catalog**

Right after the existing `const { data: quickServices } = useApiSWR<QuickService[]>('/quick-services');` line, add:

```tsx
  const { data: accessoryOptions } = useApiSWR<AccessoryOption[]>('/accessory-options');
  const [selectedAccessoryIds, setSelectedAccessoryIds] = React.useState<string[]>([]);
  const [otherAccessoryChecked, setOtherAccessoryChecked] = React.useState(false);
  const [otherAccessoryText, setOtherAccessoryText] = React.useState('');
```

- [ ] **Step 4: Add the accessories step JSX**

Insert this block right after the `{step === 'vehicle' && ( ... )}` block closes, and before `{step === 'reason' && ( ... )}`:

```tsx
      {step === 'accessories' && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <Label>Accesorios entregados</Label>
            <AccessoryChecklist
              options={accessoryOptions ?? []}
              selectedIds={selectedAccessoryIds}
              onToggle={(id) =>
                setSelectedAccessoryIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                )
              }
              otherChecked={otherAccessoryChecked}
              onOtherCheckedChange={setOtherAccessoryChecked}
              otherText={otherAccessoryText}
              onOtherTextChange={setOtherAccessoryText}
            />
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
```

This step has no `disabled` condition on "Siguiente" — not every intake has accessories to record, so it's always optional to continue.

- [ ] **Step 5: Send accessories in `handleSubmit` and fix the WhatsApp phone**

In `handleSubmit`, right after the existing:
```tsx
      if (selectedQuickServiceIds.length) {
        formData.append('quickServiceIds', JSON.stringify(selectedQuickServiceIds));
      }
```
add:
```tsx
      if (selectedAccessoryIds.length) {
        formData.append('accessoryOptionIds', JSON.stringify(selectedAccessoryIds));
      }
      if (otherAccessoryChecked && otherAccessoryText.trim()) {
        formData.append('otherAccessoryText', otherAccessoryText.trim());
      }
```

Then, in the same function, replace:
```tsx
      setResult({
        order,
        message,
        whatsappPhone: order.client?.phone ? order.client.phone.replace(/\D/g, '') : null,
      });
```
with:
```tsx
      setResult({
        order,
        message,
        whatsappPhone: order.client?.phone ? toWhatsappPhone(order.client.phone) : null,
      });
```

- [ ] **Step 6: Verify it builds**

Run: `pnpm --filter @taller/web build`
Expected: no TypeScript/ESLint errors.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(app)/orders/new/page.tsx"
git commit -m "Add accessories step to intake wizard and fix WhatsApp country code"
```

---

### Task 9: Frontend — clickable order rows

**Files:**
- Modify: `apps/web/src/app/(app)/orders/page.tsx`

- [ ] **Step 1: Import `useRouter`**

Add to the imports:
```tsx
import { useRouter } from 'next/navigation';
```

- [ ] **Step 2: Get the router instance**

In `OrdersPage`, right after `const [status, setStatus] = React.useState<string>('ALL');`, add:
```tsx
  const router = useRouter();
```

- [ ] **Step 3: Make each row clickable**

Change:
```tsx
            {data?.items.map((order) => (
              <TableRow key={order.id}>
```
to:
```tsx
            {data?.items.map((order) => (
              <TableRow
                key={order.id}
                onClick={() => router.push(`/orders/${order.id}`)}
                className="cursor-pointer hover:bg-muted/50"
              >
```

- [ ] **Step 4: Verify it builds**

Run: `pnpm --filter @taller/web build`
Expected: no TypeScript/ESLint errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/orders/page.tsx"
git commit -m "Make order list rows clickable"
```

---

### Task 10: Final verification

**Files:** none (verification only)

- [x] **Step 1: Full backend build + tests**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: both succeed with no errors; the new `intake-accessories.util.spec.ts` suite is included.

Result: passed — 7 suites, 24 tests, 0 failures.

- [x] **Step 2: Full frontend build**

```bash
pnpm --filter @taller/web build
```
Expected: succeeds with no errors.

Result: passed — all 18 routes generated, no TypeScript/ESLint errors.

- [x] **Step 3: Manual smoke test**

With both dev servers running (`pnpm --filter @taller/api start:dev`, `pnpm --filter @taller/web dev`):
- [x] Log in as `admin@tallerdemo.com` / `Password123!`.
- [x] Configuración → Accesorios: create 2-3 accessories (e.g. "Llaves", "Cargador", "Casco"), reorder them, edit one, delete one.
- [x] Órdenes → Nueva orden: complete the wizard up to the new "Accesorios" step, check a couple of boxes, check "Otro" and type something, continue through to submission.
- [x] Open the created order's detail page and confirm the "Accesorios" line under "Detalle de recepción" shows the checked labels plus the "Otro" text, comma-separated.
- [x] On the confirmation screen, for a client with a phone number entered WITHOUT a country code (e.g. type a brand-new client with phone `3105551234`), click "Enviar por WhatsApp" and confirm the opened URL contains `57` followed by the 10 digits (visible in the browser's address bar / new tab URL).
- [x] On the Órdenes list page, click anywhere on a row (not just the order number) and confirm it navigates to that order's detail page.

Result: ran this pass with an automated Playwright script driving a real Chromium browser against the running dev servers (not just visual inspection). All checks passed, including confirming the WhatsApp URL contains `573105551234` and the order detail page shows the combined accessories text. Also re-confirmed (post Task-9 fix) that clicking the order-number link still navigates correctly with no double-navigation.

- [x] **Step 4: Final commit (only if the manual pass required fixes)**

No app-code fixes were required by this manual pass (the double-navigation issue found during Task 9's code review was already fixed and committed as part of Task 9, commit `ae6d981`). No additional commit needed here.
