# Notification Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the silent, non-functional auto-notification on order status changes with an explicit "¿Desea notificar al cliente?" flow that queues a notification for Admin/Gerente/Recepción to send via WhatsApp, email, or clipboard copy.

**Architecture:** New `Notification` Prisma model + a small `NotificationInboxModule` (list/send-email/mark-sent, standalone like `AccessoryOptionsModule`) + a single `POST /orders/:id/notify` action added directly to the existing `OrdersController`/`OrdersService` (mirrors the existing `sendIntakeConfirmationEmail` single-action pattern, not the multi-endpoint sub-resource pattern used by Quotation/Diagnosis). The message is built once, server-side, at creation time and stored immutably. Frontend polls via SWR (no websocket wiring — the existing realtime gateway has no frontend client at all today, and building that is out of scope here).

**Tech Stack:** NestJS + Prisma 7 (backend), Next.js 16 App Router + SWR (frontend), following the exact module/DTO/component conventions established in `apps/api/src/accessory-options/` and `apps/web/src/app/(app)/orders/new/page.tsx`'s WhatsApp/email/copy pattern (Grupo A, already shipped).

---

## Task 1: Prisma schema + migration (Notification model)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the two new enums and the `Notification` model**

Add these enums near `enum QuotationStatus` (after line 49):

```prisma
enum NotificationStatus {
  PENDING
  SENT
}

enum NotificationChannel {
  WHATSAPP
  EMAIL
  COPY
}
```

Add the model after `model OrderStatusHistory` (after line 489):

```prisma
model Notification {
  id          String               @id @default(uuid())
  tenantId    String
  tenant      Tenant               @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  orderId     String
  order       Order                @relation(fields: [orderId], references: [id], onDelete: Cascade)
  toStatus    OrderStatus
  message     String
  status      NotificationStatus   @default(PENDING)
  createdById String
  createdBy   User                 @relation("NotificationCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  sentAt      DateTime?
  sentById    String?
  sentBy      User?                @relation("NotificationSentBy", fields: [sentById], references: [id], onDelete: SetNull)
  sentVia     NotificationChannel?
  createdAt   DateTime             @default(now())

  @@index([tenantId, status])
  @@map("notifications")
}
```

- [ ] **Step 2: Add inverse relations**

In `model Tenant` (around line 185, right after `accessoryOptions   AccessoryOption[]`):

```prisma
  notifications      Notification[]
```

In `model Order` (around line 372, right after `appointments       Appointment[]`):

```prisma
  notifications      Notification[]
```

In `model User` (around line 243, right after `assignedAppointments Appointment[]`):

```prisma
  notificationsCreated Notification[] @relation("NotificationCreatedBy")
  notificationsSent     Notification[] @relation("NotificationSentBy")
```

- [ ] **Step 3: Generate and run the migration**

```bash
pnpm --filter @taller/api exec prisma migrate dev --name notification_inbox
```

Expected: migration succeeds, creates `notifications` table plus the two new enum types, and regenerates the Prisma client.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "Add Notification model for status-change notification inbox"
```

---

## Task 2: Backend — status-change message utility (TDD)

**Files:**
- Create: `apps/api/src/orders/notification-message.util.ts`
- Test: `apps/api/src/orders/notification-message.util.spec.ts`

The backend does not depend on `@taller/shared` (confirmed: no `apps/api` file imports it), so this file needs its own small Spanish status-label map — the same "kept in sync manually" duplication already accepted for `packages/shared/src/enums.ts`'s `ORDER_STATUS_LABELS` vs. the Prisma schema.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/api/src/orders/notification-message.util.spec.ts
import { buildStatusChangeMessage } from './notification-message.util';

describe('buildStatusChangeMessage', () => {
  it('builds a generic status-change message', () => {
    const message = buildStatusChangeMessage({
      clientFirstName: 'Carlos',
      orderNumber: 123,
      status: 'IN_REPAIR',
      tenantName: 'Taller Demo',
    });
    expect(message).toBe(
      'Hola Carlos. Tu vehículo (Orden #123) cambió de estado a: En reparación.\nCualquier duda, contáctanos.\nEquipo Taller Demo',
    );
  });

  it('builds a thank-you message for DELIVERED', () => {
    const message = buildStatusChangeMessage({
      clientFirstName: 'Ana',
      orderNumber: 456,
      status: 'DELIVERED',
      tenantName: 'Taller Demo',
    });
    expect(message).toBe(
      'Hola Ana. Gracias por confiar en nosotros — tu vehículo (Orden #456) fue entregado exitosamente. ¡Será un gusto atenderte de nuevo!\nEquipo Taller Demo',
    );
  });

  it('covers every OrderStatus value without throwing', () => {
    const statuses = [
      'RECEIVED',
      'DIAGNOSING',
      'WAITING_APPROVAL',
      'WAITING_PARTS',
      'IN_REPAIR',
      'TESTING',
      'READY_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED',
      'WARRANTY',
    ] as const;
    for (const status of statuses) {
      const message = buildStatusChangeMessage({
        clientFirstName: 'Cliente',
        orderNumber: 1,
        status,
        tenantName: 'Taller',
      });
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @taller/api test notification-message.util
```
Expected: FAIL — `Cannot find module './notification-message.util'`.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/orders/notification-message.util.ts
import { OrderStatus } from '../generated/prisma/enums';

/**
 * Backend-local mirror of packages/shared/src/enums.ts's ORDER_STATUS_LABELS.
 * Kept in sync manually — the backend does not depend on @taller/shared.
 */
const STATUS_LABELS_ES: Record<OrderStatus, string> = {
  RECEIVED: 'Recibida',
  DIAGNOSING: 'En diagnóstico',
  WAITING_APPROVAL: 'Esperando aprobación',
  WAITING_PARTS: 'Esperando repuestos',
  IN_REPAIR: 'En reparación',
  TESTING: 'En pruebas',
  READY_FOR_DELIVERY: 'Lista para entrega',
  DELIVERED: 'Entregada',
  CANCELLED: 'Cancelada',
  WARRANTY: 'Garantía',
};

export function buildStatusChangeMessage(params: {
  clientFirstName: string;
  orderNumber: number;
  status: OrderStatus;
  tenantName: string;
}): string {
  const { clientFirstName, orderNumber, status, tenantName } = params;
  if (status === OrderStatus.DELIVERED) {
    return `Hola ${clientFirstName}. Gracias por confiar en nosotros — tu vehículo (Orden #${orderNumber}) fue entregado exitosamente. ¡Será un gusto atenderte de nuevo!\nEquipo ${tenantName}`;
  }
  return `Hola ${clientFirstName}. Tu vehículo (Orden #${orderNumber}) cambió de estado a: ${STATUS_LABELS_ES[status]}.\nCualquier duda, contáctanos.\nEquipo ${tenantName}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @taller/api test notification-message.util
```
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/orders/notification-message.util.ts apps/api/src/orders/notification-message.util.spec.ts
git commit -m "Add status-change notification message builder"
```

---

## Task 3: Backend — EmailService method for notification messages

**Files:**
- Modify: `apps/api/src/notifications/email.service.ts:79-89` (replace the dead `sendOrderStatusUpdate` method — never called anywhere per the codebase search — with one that sends the already-built message)

- [ ] **Step 1: Replace `sendOrderStatusUpdate` with `sendNotificationMessage`**

Replace this existing dead method:

```ts
  async sendOrderStatusUpdate(
    to: string,
    orderNumber: number,
    statusLabel: string,
  ) {
    return this.send({
      to,
      subject: `Actualización de tu orden #${orderNumber}`,
      html: `<p>Tu bicimoto (orden <strong>#${orderNumber}</strong>) ahora está: <strong>${statusLabel}</strong>.</p>`,
    });
  }
```

with:

```ts
  async sendNotificationMessage(to: string, orderNumber: number, message: string) {
    return this.send({
      to,
      subject: `Actualización de tu orden #${orderNumber}`,
      html: `<p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>`,
    });
  }
```

(`escapeHtml` is already defined at the top of this file and used by `sendIntakeConfirmation`'s sibling methods — reuse it here too, since `message` contains the client's first name and is technically free-ish text.)

- [ ] **Step 2: Verify the backend still builds**

```bash
pnpm --filter @taller/api build
```
Expected: succeeds — confirms nothing else referenced the removed `sendOrderStatusUpdate` (already confirmed via codebase search before writing this plan, but re-verify after the edit).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/notifications/email.service.ts
git commit -m "Replace unused sendOrderStatusUpdate with sendNotificationMessage"
```

---

## Task 4: Backend — `POST /orders/:id/notify` + remove silent auto-notify

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts`
- Modify: `apps/api/src/orders/orders.controller.ts`

- [ ] **Step 1: Remove the silent auto-notify mechanism**

In `apps/api/src/orders/orders.service.ts`, delete the private `notifyStatusChange` method (lines 537-558) entirely, and remove its two call sites:

In `updateStatus` (around line 533), remove this line:
```ts
    this.notifyStatusChange(updated).catch(() => undefined);
```

In `deliver` (around line 468), remove this line:
```ts
    this.notifyStatusChange(updated).catch(() => undefined);
```

Both methods keep their `this.realtime.emitOrderUpdated(tenantId, updated);` line and `return updated;` — only the notify call is removed.

- [ ] **Step 2: Add the `notify` method to `OrdersService`**

Add this new method right after `sendIntakeConfirmationEmail` (after line 487), and add the import at the top of the file:

```ts
import { buildStatusChangeMessage } from './notification-message.util';
```

```ts
  async notify(tenantId: string, id: string, userId: string) {
    const order = await this.findOne(tenantId, id);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const message = buildStatusChangeMessage({
      clientFirstName: order.client.firstName,
      orderNumber: order.orderNumber,
      status: order.status,
      tenantName: tenant.name,
    });
    return this.prisma.notification.create({
      data: {
        tenantId,
        orderId: id,
        toStatus: order.status,
        message,
        createdById: userId,
      },
    });
  }
```

- [ ] **Step 3: Add the controller endpoint**

In `apps/api/src/orders/orders.controller.ts`, add right after the `sendIntakeMessage` handler (after line 147):

```ts
  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TECHNICIAN)
  @Audit('Notification')
  @Post(':id/notify')
  notify(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.ordersService.notify(tenantId, id, userId);
  }
```

- [ ] **Step 4: Verify build**

```bash
pnpm --filter @taller/api build
```
Expected: succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/orders/orders.service.ts apps/api/src/orders/orders.controller.ts
git commit -m "Replace silent auto-notify with explicit POST /orders/:id/notify"
```

---

## Task 5: Backend — `NotificationInboxModule` (list, send-email, mark-sent)

**Files:**
- Create: `apps/api/src/notification-inbox/dto/list-notifications-query.dto.ts`
- Create: `apps/api/src/notification-inbox/dto/mark-notification-sent.dto.ts`
- Create: `apps/api/src/notification-inbox/notification-inbox.service.ts`
- Create: `apps/api/src/notification-inbox/notification-inbox.controller.ts`
- Create: `apps/api/src/notification-inbox/notification-inbox.module.ts`
- Modify: `apps/api/src/app.module.ts`

Named `notification-inbox` (not `notifications`) to avoid colliding with the existing `apps/api/src/notifications/` folder, which holds `EmailService`/`WhatsappService` and is unrelated to this feature's data model. The HTTP route is still `/notifications`.

- [ ] **Step 1: DTOs**

```ts
// apps/api/src/notification-inbox/dto/list-notifications-query.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { NotificationStatus } from '../../generated/prisma/enums';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: NotificationStatus })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;
}
```

```ts
// apps/api/src/notification-inbox/dto/mark-notification-sent.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class MarkNotificationSentDto {
  @ApiProperty({ enum: ['WHATSAPP', 'COPY'] })
  @IsIn(['WHATSAPP', 'COPY'])
  channel: 'WHATSAPP' | 'COPY';
}
```

- [ ] **Step 2: Service**

```ts
// apps/api/src/notification-inbox/notification-inbox.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../notifications/email.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { MarkNotificationSentDto } from './dto/mark-notification-sent.dto';
import { NotificationStatus } from '../generated/prisma/enums';

const NOTIFICATION_LIST_INCLUDE = {
  order: {
    select: {
      orderNumber: true,
      client: {
        select: { firstName: true, lastName: true, phone: true, email: true },
      },
    },
  },
  createdBy: { select: { firstName: true, lastName: true } },
  sentBy: { select: { firstName: true, lastName: true } },
} as const;

@Injectable()
export class NotificationInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async findAll(tenantId: string, query: ListNotificationsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: NOTIFICATION_LIST_INCLUDE,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async sendEmail(tenantId: string, id: string, userId: string) {
    const notification = await this.assertExists(tenantId, id);
    const email = notification.order.client.email;
    if (!email) {
      throw new BadRequestException('El cliente no tiene correo registrado');
    }
    await this.email.sendNotificationMessage(
      email,
      notification.order.orderNumber,
      notification.message,
    );
    return this.markSentInternal(id, userId, 'EMAIL');
  }

  async markSent(tenantId: string, id: string, userId: string, dto: MarkNotificationSentDto) {
    await this.assertExists(tenantId, id);
    return this.markSentInternal(id, userId, dto.channel);
  }

  private async markSentInternal(
    id: string,
    userId: string,
    channel: 'WHATSAPP' | 'EMAIL' | 'COPY',
  ) {
    return this.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.SENT,
        sentAt: new Date(),
        sentById: userId,
        sentVia: channel,
      },
      include: NOTIFICATION_LIST_INCLUDE,
    });
  }

  private async assertExists(tenantId: string, id: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, tenantId },
      include: NOTIFICATION_LIST_INCLUDE,
    });
    if (!notification) throw new NotFoundException('Notificación no encontrada');
    if (notification.status === NotificationStatus.SENT) {
      throw new BadRequestException('Esta notificación ya fue enviada');
    }
    return notification;
  }
}
```

- [ ] **Step 3: Controller**

```ts
// apps/api/src/notification-inbox/notification-inbox.controller.ts
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { NotificationInboxService } from './notification-inbox.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { MarkNotificationSentDto } from './dto/mark-notification-sent.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('notifications')
@Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
@Controller('notifications')
export class NotificationInboxController {
  constructor(private readonly notificationInboxService: NotificationInboxService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notificationInboxService.findAll(tenantId, query);
  }

  @Audit('Notification')
  @HttpCode(HttpStatus.OK)
  @Post(':id/send-email')
  sendEmail(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.notificationInboxService.sendEmail(tenantId, id, userId);
  }

  @Audit('Notification')
  @HttpCode(HttpStatus.OK)
  @Post(':id/mark-sent')
  markSent(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: MarkNotificationSentDto,
  ) {
    return this.notificationInboxService.markSent(tenantId, id, userId, dto);
  }
}
```

Note: `@Roles(...)` is applied at the controller level here (all three endpoints share the same role set), unlike `OrdersController` where it's per-method — this matches the simpler pattern used when every handler in a controller needs identical role restrictions.

- [ ] **Step 4: Module**

```ts
// apps/api/src/notification-inbox/notification-inbox.module.ts
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationInboxService } from './notification-inbox.service';
import { NotificationInboxController } from './notification-inbox.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [NotificationInboxController],
  providers: [NotificationInboxService],
})
export class NotificationInboxModule {}
```

- [ ] **Step 5: Register in `AppModule`**

In `apps/api/src/app.module.ts`, add the import:

```ts
import { NotificationInboxModule } from './notification-inbox/notification-inbox.module';
```

And add `NotificationInboxModule` to the `imports` array, right after `AccessoryOptionsModule,`:

```ts
    AccessoryOptionsModule,
    NotificationInboxModule,
```

- [ ] **Step 6: Verify build**

```bash
pnpm --filter @taller/api build
```
Expected: succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/notification-inbox apps/api/src/app.module.ts
git commit -m "Add NotificationInboxModule (list, send-email, mark-sent)"
```

---

## Task 6: Frontend — types + phone/email helpers wiring

**Files:**
- Modify: `apps/web/src/lib/types.ts`

- [ ] **Step 1: Add the `Notification` type**

Add after the `OrderStatusHistoryEntry` interface (after line 167):

```ts
export interface Notification {
  id: string;
  orderId: string;
  order: {
    orderNumber: number;
    client: {
      firstName: string;
      lastName: string;
      phone?: string | null;
      email?: string | null;
    };
  };
  toStatus: OrderStatus;
  message: string;
  status: 'PENDING' | 'SENT';
  createdBy: { firstName: string; lastName: string };
  sentAt?: string | null;
  sentBy?: { firstName: string; lastName: string } | null;
  sentVia?: 'WHATSAPP' | 'EMAIL' | 'COPY' | null;
  createdAt: string;
}
```

- [ ] **Step 2: Verify frontend typecheck**

```bash
pnpm --filter @taller/web build
```
Expected: succeeds (this type isn't used anywhere yet, so this just confirms no syntax error).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/types.ts
git commit -m "Add Notification frontend type"
```

---

## Task 7: Frontend — "¿Desea notificar al cliente?" confirmation dialog

**Files:**
- Create: `apps/web/src/components/orders/notify-client-dialog.tsx`
- Modify: `apps/web/src/app/(app)/orders/[id]/page.tsx`

- [ ] **Step 1: Create the shared confirmation dialog**

```tsx
// apps/web/src/components/orders/notify-client-dialog.tsx
'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';

export function NotifyClientDialog({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      await api.post(`/orders/${orderId}/notify`);
      toast.success('Notificación creada — revísala en el buzón de notificaciones');
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Desea generar una notificación para el cliente?</DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            No
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Creando...' : 'Sí'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire it into `StatusChanger`**

In `apps/web/src/app/(app)/orders/[id]/page.tsx`, add the import:

```ts
import { NotifyClientDialog } from '@/components/orders/notify-client-dialog';
```

Replace the `StatusChanger` function (lines 143-186) with:

```tsx
function StatusChanger({
  orderId,
  currentStatus,
  onUpdated,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  onUpdated: () => void;
}) {
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [notifyOpen, setNotifyOpen] = React.useState(false);

  async function handleChange(status: string) {
    setIsUpdating(true);
    try {
      await api.patch(`/orders/${orderId}/status`, { status });
      toast.success('Estado actualizado');
      onUpdated();
      setNotifyOpen(true);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">Cambiar estado</Label>
      <Select value={currentStatus} onValueChange={handleChange} disabled={isUpdating}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(ORDER_STATUS_LABELS)
            .filter(([value]) => value !== 'DELIVERED' || value === currentStatus)
            .map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <NotifyClientDialog orderId={orderId} open={notifyOpen} onOpenChange={setNotifyOpen} />
    </div>
  );
}
```

(Only change from the original: new `notifyOpen` state, `setNotifyOpen(true)` after the success toast, and the `<NotifyClientDialog>` rendered at the end.)

- [ ] **Step 3: Wire it into `DeliverVehicleDialog`**

Replace the `DeliverVehicleDialog` function (lines 242-299) with:

```tsx
function DeliverVehicleDialog({ orderId, onUpdated }: { orderId: string; onUpdated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [pickupCode, setPickupCode] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [notifyOpen, setNotifyOpen] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await api.post(`/orders/${orderId}/deliver`, { pickupCode });
      toast.success('Vehículo entregado');
      setOpen(false);
      setPickupCode('');
      onUpdated();
      setNotifyOpen(true);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setPickupCode('');
        }}
      >
        <DialogTrigger asChild>
          <Button size="sm">Entregar vehículo</Button>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Entregar vehículo</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-1.5 py-4">
              <Label>Clave de retiro</Label>
              <Input
                required
                inputMode="numeric"
                maxLength={6}
                value={pickupCode}
                onChange={(e) => setPickupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting || !/^\d{6}$/.test(pickupCode)}>
                {isSubmitting ? 'Verificando...' : 'Confirmar entrega'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <NotifyClientDialog orderId={orderId} open={notifyOpen} onOpenChange={setNotifyOpen} />
    </>
  );
}
```

(Only changes: new `notifyOpen` state, `setNotifyOpen(true)` after the success toast, wrapped the return in a fragment, and the `<NotifyClientDialog>` added as a sibling of the delivery `<Dialog>` — it must be a sibling, not nested inside, so it can stay open after the delivery dialog closes.)

- [x] **Step 4: Verify build**

```bash
pnpm --filter @taller/web build
```
Expected: succeeds with no errors.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/components/orders/notify-client-dialog.tsx "apps/web/src/app/(app)/orders/[id]/page.tsx"
git commit -m "Ask to notify client after status change or delivery"
```

**Post-review fix (commit `b2edd34`):** the literal Steps 2-3 code above has `DeliverVehicleDialog` own its own `notifyOpen` state and render its own `<NotifyClientDialog>`. Code review caught a real bug in that design: `DeliverVehicleDialog` is only rendered by the parent while `order.status === 'READY_FOR_DELIVERY'`, and a successful delivery flips the status and triggers a refetch — unmounting `DeliverVehicleDialog` (and the just-opened notify dialog nested inside it) before the user could answer. Fixed by lifting `notifyOpen` and the single `<NotifyClientDialog>` render up to the always-mounted `OrderDetailPage`, with `StatusChanger`/`DeliverVehicleDialog` taking an `onNotify: () => void` prop instead of owning the dialog themselves. `DeliverVehicleDialog` also delays its `onNotify()` call by 200ms so the pickup-code dialog's close animation finishes before the notify dialog opens, avoiding a double-overlay flicker (a secondary Important finding from the same review). See the actual committed code, not the snippets above, as the source of truth for this task.

---

## Task 8: Frontend — shared notification action buttons

**Files:**
- Create: `apps/web/src/components/notifications/notification-actions.tsx`

This component is used by both the topbar dropdown (Task 9) and the full inbox page (Task 10), so it's built standalone first.

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/components/notifications/notification-actions.tsx
'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { toWhatsappPhone } from '@/lib/phone';
import type { Notification } from '@/lib/types';

export function NotificationActions({
  notification,
  onSent,
}: {
  notification: Notification;
  onSent: () => void;
}) {
  const [isSending, setIsSending] = React.useState(false);
  const phone = notification.order.client.phone;
  const email = notification.order.client.email;
  const whatsappPhone = phone ? toWhatsappPhone(phone) : null;

  async function handleWhatsapp() {
    if (!whatsappPhone) return;
    window.open(
      `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(notification.message)}`,
      '_blank',
    );
    setIsSending(true);
    try {
      await api.post(`/notifications/${notification.id}/mark-sent`, { channel: 'WHATSAPP' });
      onSent();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  }

  async function handleEmail() {
    setIsSending(true);
    try {
      await api.post(`/notifications/${notification.id}/send-email`);
      toast.success('Correo enviado');
      onSent();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(notification.message);
    toast.success('Mensaje copiado');
    setIsSending(true);
    try {
      await api.post(`/notifications/${notification.id}/mark-sent`, { channel: 'COPY' });
      onSent();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {whatsappPhone && (
        <Button size="sm" onClick={handleWhatsapp} disabled={isSending}>
          WhatsApp
        </Button>
      )}
      {email && (
        <Button size="sm" variant="outline" onClick={handleEmail} disabled={isSending}>
          Correo
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={handleCopy} disabled={isSending}>
        Copiar
      </Button>
    </div>
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
git add apps/web/src/components/notifications/notification-actions.tsx
git commit -m "Add shared notification action buttons (WhatsApp/Correo/Copiar)"
```

**Post-review fix (commit `fa9e79f`):** code review found `handleCopy`'s `navigator.clipboard.writeText(...)` call was unguarded — a rejected promise (permission denied, unfocused tab) would throw before any toast or state update, leaving the user with silent, total failure feedback. It also flagged that when the client-side action (opening WhatsApp / writing the clipboard) succeeds but the follow-up `mark-sent` call fails, the generic error toast gave no indication the external action had already happened. Fixed by wrapping the clipboard write in its own try/catch with an early return on failure, and rewording both `handleWhatsapp`'s and `handleCopy`'s `mark-sent`-failure toasts to explicitly acknowledge the already-completed action (e.g. "Se copió el mensaje, pero no se pudo marcar como enviada: ..."). See the actual committed code, not the snippet above, as the source of truth for this task.

---

## Task 9: Frontend — bell icon in topbar

**Files:**
- Modify: `apps/web/src/components/layout/topbar.tsx`

- [x] **Step 1: Add the bell dropdown**

In `apps/web/src/components/layout/topbar.tsx`, add these imports:

```ts
import Link from 'next/link';
import { Bell, Menu, LogOut, User as UserIcon } from 'lucide-react';
import { useApiSWR } from '@/hooks/use-api-swr';
import { NotificationActions } from '@/components/notifications/notification-actions';
import type { Notification, PaginatedResult } from '@/lib/types';
```

(Replace the existing `import { Menu, LogOut, User as UserIcon } from 'lucide-react';` line with the merged one above.)

Add this component in the same file, above `export function Topbar()`:

```tsx
function NotificationBell() {
  const { user } = useAuth();
  const canSeeInbox = user && ['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(user.role);
  const { data, mutate } = useApiSWR<PaginatedResult<Notification>>(
    canSeeInbox ? '/notifications?status=PENDING&pageSize=5' : null,
    { refreshInterval: 30_000 },
  );

  if (!canSeeInbox) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-5" />
          {!!data?.total && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
              {data.total > 9 ? '9+' : data.total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notificaciones pendientes</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(!data || data.items.length === 0) && (
          <p className="px-2 py-3 text-sm text-muted-foreground">Sin notificaciones pendientes</p>
        )}
        {data?.items.map((n) => (
          <div key={n.id} className="flex flex-col gap-1.5 border-b p-2 text-sm last:border-b-0">
            <p className="font-medium">Orden #{n.order.orderNumber}</p>
            <p className="text-muted-foreground">{n.message}</p>
            <NotificationActions notification={n} onSent={() => mutate()} />
          </div>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notifications">Ver todas</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Then render it in `Topbar`, right before `<ThemeToggle />`:

```tsx
      <NotificationBell />
      <ThemeToggle />
```

- [x] **Step 2: Verify build**

```bash
pnpm --filter @taller/web build
```
Expected: succeeds with no errors.

- [x] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/topbar.tsx
git commit -m "Add notification bell with pending count to topbar"
```

**Post-review fix (commit `7fb24d1`):** code review found the icon-only bell trigger button had no `aria-label`, unlike its sibling `ThemeToggle` in the same file. Fixed by adding `aria-label={\`Notificaciones${data?.total ? \`, ${data.total} pendientes\` : ''}\`}`, which also announces the pending count dynamically.

---

## Task 10: Frontend — full `/notifications` page

**Files:**
- Create: `apps/web/src/app/(app)/notifications/page.tsx`

- [x] **Step 1: Create the page**

```tsx
// apps/web/src/app/(app)/notifications/page.tsx
'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotificationActions } from '@/components/notifications/notification-actions';
import { useApiSWR } from '@/hooks/use-api-swr';
import type { Notification, PaginatedResult } from '@/lib/types';

export default function NotificationsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Notificaciones</h1>
      <Tabs defaultValue="PENDING">
        <TabsList>
          <TabsTrigger value="PENDING">Pendientes</TabsTrigger>
          <TabsTrigger value="SENT">Notificadas</TabsTrigger>
        </TabsList>
        <TabsContent value="PENDING">
          <NotificationList status="PENDING" />
        </TabsContent>
        <TabsContent value="SENT">
          <NotificationList status="SENT" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NotificationList({ status }: { status: 'PENDING' | 'SENT' }) {
  const { data, isLoading, mutate } = useApiSWR<PaginatedResult<Notification>>(
    `/notifications?status=${status}&pageSize=50`,
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 pt-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return <p className="pt-4 text-sm text-muted-foreground">Sin notificaciones aquí.</p>;
  }

  return (
    <div className="flex flex-col gap-3 pt-4">
      {data.items.map((n) => (
        <Card key={n.id}>
          <CardContent className="flex flex-col gap-2 pt-6 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">Orden #{n.order.orderNumber}</p>
              <Badge variant={status === 'SENT' ? 'success' : 'warning'}>
                {status === 'SENT' ? 'Notificada' : 'Pendiente'}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {n.order.client.firstName} {n.order.client.lastName}
            </p>
            <p className="whitespace-pre-line">{n.message}</p>
            {status === 'PENDING' && <NotificationActions notification={n} onSent={() => mutate()} />}
            {status === 'SENT' && n.sentBy && (
              <p className="text-xs text-muted-foreground">
                Enviada por {n.sentBy.firstName} {n.sentBy.lastName} vía {n.sentVia?.toLowerCase()}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [x] **Step 2: Verify build**

```bash
pnpm --filter @taller/web build
```
Expected: succeeds — new route `/notifications` appears in the build output.

- [x] **Step 3: Commit**

```bash
git add "apps/web/src/app/(app)/notifications/page.tsx"
git commit -m "Add full notifications inbox page with Pendiente/Notificada tabs"
```

**Post-review fix (commit `c674b04`):** code review found `n.sentVia?.toLowerCase()` rendered raw English enum values ("email", "copy") into an otherwise fully Spanish UI, breaking this app's established `_LABELS`-map convention used everywhere else (`ORDER_STATUS_LABELS`, `PAYMENT_METHOD_LABELS`, etc.). Fixed with a local `CHANNEL_LABELS` map (`WHATSAPP` → "WhatsApp", `EMAIL` → "correo", `COPY` → "portapapeles"). Task 11's smoke-test checklist below was updated to match.

---

## Task 11: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full backend build + tests**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: both succeed with no errors; `notification-message.util.spec.ts` is included and passes.

- [ ] **Step 2: Full frontend build**

```bash
pnpm --filter @taller/web build
```
Expected: succeeds with no errors; `/notifications` appears as a new route.

- [ ] **Step 3: Manual smoke test**

With both dev servers running (`pnpm --filter @taller/api start:dev`, `pnpm --filter @taller/web dev`):
- [ ] Log in as `admin@tallerdemo.com` / `Password123!`.
- [ ] Open an existing order (or create one via the intake wizard), change its status via the "Cambiar estado" selector, confirm the "¿Desea generar una notificación?" dialog appears, click "Sí".
- [ ] Confirm the bell icon in the topbar shows a pending count of at least 1, and the dropdown lists the new notification with the correct order number and message text.
- [ ] From the dropdown, click "Copiar" — confirm a success toast appears and the pending count decreases by 1.
- [ ] Go to `/notifications`, confirm the copied notification now appears under "Notificadas" with the correct "Enviada por ... vía portapapeles" line (channel labels are Spanish, see Task 10's post-review fix), and no longer appears under "Pendientes".
- [ ] Repeat with a different order using the WhatsApp button — confirm a new tab opens to a `wa.me` link containing the message text and the `57`-prefixed phone number (reusing the Group A fix), and the notification moves to "Notificadas".
- [ ] Drive an order to `READY_FOR_DELIVERY` and use "Entregar vehículo" with the correct pickup code — confirm the same "¿Desea notificar?" dialog appears after delivery succeeds (not just after generic status changes).
- [ ] Confirm a technician-role user changing an order's status also sees the same dialog (per the "cualquiera que cambie el estado" decision).

- [ ] **Step 4: Final commit (only if the manual pass required fixes)**

```bash
git add -A
git commit -m "Fix issues found during manual verification of notification inbox"
```
