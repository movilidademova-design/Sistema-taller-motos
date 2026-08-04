# Módulo de Cotizaciones — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar el diagnóstico con la cotización: al guardar un diagnóstico con repuestos se crea la cotización, el personal la revisa y le pone precios, se genera un PDF con el formato del taller, y se envía por WhatsApp reutilizando el mecanismo que ya existe. Los estados los cambia siempre una persona.

**Architecture:** Casi todo existe. `Quotation`/`QuotationItem`, la aprobación que descuenta inventario, `pdfkit`, el almacenamiento público en `/uploads` y el envío por `wa.me` con `Notification` ya funcionan. Lo nuevo: más estados, una tabla de historial espejo de `OrderStatusHistory`, un renderizador de PDF propio, y el enganche desde el diagnóstico.

**Tech Stack:** NestJS + Prisma 7 + PostgreSQL (`apps/api`), Next.js 16 (`apps/web`), pdfkit, Jest.

**Spec:** `docs/superpowers/specs/2026-08-04-cotizaciones-design.md`

**Respaldo antes de empezar** (la tarea 1 borra `laborCost` y un valor del enum):
`docker exec sistema-taller-motos-postgres-1 pg_dump -U postgres taller_motos > respaldo-antes-cotizaciones.sql`

---

## Task 1: Esquema — estados, PDF e historial

**Files:** `apps/api/prisma/schema.prisma`, migración, `packages/shared/src/enums.ts`

- [x] **Step 1: Enums y modelos**

En `apps/api/prisma/schema.prisma`:

```prisma
enum QuotationStatus {
  DRAFT
  PENDING_REVIEW
  READY_TO_SEND
  SENT
  APPROVED
  PARTIALLY_APPROVED
  REJECTED
}

enum QuotationItemType {
  PART
  OTHER
}
```

En `Quotation`: **eliminar** `laborCost`, **agregar** `pdfUrl String?` y `sentAt DateTime?`, cambiar el default de `status` a `DRAFT`, y agregar la relación `history QuotationStatusHistory[]`.

Modelo nuevo:

```prisma
model QuotationStatusHistory {
  id          String           @id @default(uuid())
  quotationId String
  quotation   Quotation        @relation(fields: [quotationId], references: [id], onDelete: Cascade)
  fromStatus  QuotationStatus?
  toStatus    QuotationStatus
  changedById String
  changedBy   User             @relation(fields: [changedById], references: [id], onDelete: Restrict)
  notes       String?
  createdAt   DateTime         @default(now())

  @@index([quotationId])
  @@map("quotation_status_history")
}
```

Agregar la relación inversa en `User`: `quotationStatusChanges QuotationStatusHistory[]`.

- [x] **Step 2: Migración**

Hay 0 cotizaciones en la base, así que borrar `laborCost` y el valor `LABOR` no pierde datos. Postgres no permite quitar un valor de un enum, así que hay que recrearlo.

```bash
cd apps/api && npx prisma migrate dev --name quotation_workflow --create-only
```

Revisar el SQL generado. Debe recrear ambos enums (Prisma lo hace con `CREATE TYPE ..._new` + `ALTER TABLE ... USING` + `DROP TYPE`), borrar `laborCost`, agregar `pdfUrl`/`sentAt` y crear la tabla nueva. Si Prisma se queja de que no puede convertir `PENDING`, editar el `USING` para mapear `'PENDING'` a `'PENDING_REVIEW'`. Luego:

```bash
npx prisma migrate dev && npx prisma generate
docker exec sistema-taller-motos-postgres-1 psql -U postgres -d taller_motos -c "\d quotations" -c "\d quotation_status_history"
```

- [x] **Step 3: Enums compartidos**

En `packages/shared/src/enums.ts`, reemplazar `QuotationStatus` por los 7 valores y quitar `LABOR` de `QuotationItemType`. Agregar etiquetas:

```ts
export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_REVIEW: 'Esperando revisión',
  READY_TO_SEND: 'Lista para enviar',
  SENT: 'Enviada',
  APPROVED: 'Aprobada',
  PARTIALLY_APPROVED: 'Aprobada parcialmente',
  REJECTED: 'Rechazada',
};
```

- [x] **Step 4: Verificar y commitear**

El build queda roto (el servicio usa `laborCost` y `LABOR`); se cierra en la tarea 2. **No commitear todavía** — la tarea 2 hace el commit conjunto.

---

## Task 2: Backend — el diagnóstico genera la cotización

**Files:** `apps/api/src/orders/diagnosis/diagnosis.service.ts`, `apps/api/src/orders/quotations/quotations.service.ts`, `apps/api/src/orders/quotations/dto/upsert-quotation.dto.ts`

- [x] **Step 1: Quitar el movimiento de inventario del diagnóstico**

En `diagnosis.service.ts`, `addPart` deja de tocar stock — solo consulta el producto para copiar su precio:

```ts
      let unitCost = 0;

      if (dto.productId) {
        const product = await tx.product.findFirst({
          where: { id: dto.productId, tenantId },
        });
        if (!product) throw new NotFoundException('Producto no encontrado');
        // El stock NO se mueve aquí: el técnico solo está listando lo que hace
        // falta. Sale del inventario cuando el cliente aprueba la cotización
        // (ver QuotationsService.decide) — si rechaza, nunca salió nada.
        unitCost = Number(product.unitCost);
      }
```

Y `removePart` deja de reponer stock: borra la fila y ya. Eliminar de ambos métodos las llamadas a `tx.product.update` y `tx.inventoryMovement.create`, y los imports que queden sin uso (`InventoryMovementType`, y `BadRequestException` si no lo usa nada más).

- [x] **Step 2: Crear la cotización al guardar el diagnóstico**

En `diagnosis.service.ts`, al final de `upsert`, después de guardar el diagnóstico:

```ts
    const parts = await this.prisma.diagnosisPart.findMany({
      where: { diagnosis: { orderId } },
    });

    // Sin repuestos no hay nada que cotizar: la orden sigue su curso normal.
    if (parts.length > 0) {
      await this.quotations.createFromDiagnosis(
        tenantId,
        orderId,
        technicianId,
        parts,
      );
    }
```

Inyectar `QuotationsService` en el constructor de `DiagnosisService`. Ambos viven en `OrdersModule`, así que no hace falta tocar módulos. **Si NestJS reporta dependencia circular** (`QuotationsService` inyecta `OrdersService`, no `DiagnosisService`, así que no debería), resolver con `forwardRef` y reportarlo.

- [x] **Step 3: `createFromDiagnosis` en `QuotationsService`**

```ts
  /**
   * Convierte los repuestos del diagnóstico en una cotización por revisar.
   * Es el único cambio de estado automático del módulo: todo lo demás lo decide
   * una persona. Reemplaza los ítems cada vez, porque el técnico puede guardar
   * el diagnóstico varias veces mientras trabaja.
   */
  async createFromDiagnosis(
    tenantId: string,
    orderId: string,
    technicianId: string,
    parts: { productId: string | null; description: string; quantity: number; unitCost: Prisma.Decimal }[],
  ) {
    const order = await this.ordersService.assertOrderExists(tenantId, orderId);
    const existing = await this.prisma.quotation.findUnique({ where: { orderId } });

    // Una vez enviada o decidida, el diagnóstico ya no la puede pisar: el
    // cliente vio esa versión y quien manda a partir de ahí es el personal.
    if (existing && !EDITABLE_STATUSES.includes(existing.status)) return existing;

    const items = parts.map((p) => ({
      type: QuotationItemType.PART,
      productId: p.productId,
      description: p.description,
      quantity: new Prisma.Decimal(p.quantity),
      unitPrice: p.unitCost,
      subtotal: new Prisma.Decimal(Number(p.unitCost) * p.quantity),
    }));

    return this.prisma.$transaction(async (tx) => {
      const quotation = await tx.quotation.upsert({
        where: { orderId },
        create: { orderId, status: QuotationStatus.PENDING_REVIEW, ...totalsOf(items) },
        update: { status: QuotationStatus.PENDING_REVIEW, ...totalsOf(items) },
      });
      await tx.quotationItem.deleteMany({ where: { quotationId: quotation.id } });
      await tx.quotationItem.createMany({
        data: items.map((i) => ({ ...i, quotationId: quotation.id })),
      });
      await tx.quotationStatusHistory.create({
        data: {
          quotationId: quotation.id,
          fromStatus: existing?.status ?? null,
          toStatus: QuotationStatus.PENDING_REVIEW,
          changedById: technicianId,
          notes: 'Generada desde el diagnóstico',
        },
      });

      if (order.status === OrderStatus.DIAGNOSING) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.WAITING_APPROVAL },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: OrderStatus.DIAGNOSING,
            toStatus: OrderStatus.WAITING_APPROVAL,
            changedById: technicianId,
            notes: 'Diagnóstico con repuestos: cotización por revisar',
          },
        });
      }
      return quotation;
    });
  }
```

`createFromDiagnosis` usa `Prisma.Decimal`, así que el archivo necesita `import { Prisma } from '../../generated/prisma/client';` — hoy solo importa de `.../enums`.

A nivel de módulo, junto al `sumByType` existente:

```ts
/** Estados en los que la cotización todavía se puede editar libremente. */
export const EDITABLE_STATUSES: QuotationStatus[] = [
  QuotationStatus.DRAFT,
  QuotationStatus.PENDING_REVIEW,
  QuotationStatus.READY_TO_SEND,
  QuotationStatus.PARTIALLY_APPROVED,
];

function totalsOf(items: { quantity: Prisma.Decimal; subtotal: Prisma.Decimal }[]) {
  const partsCost = items.reduce((acc, i) => acc + Number(i.subtotal), 0);
  return { partsCost, discount: 0, taxRate: 0, taxAmount: 0, total: partsCost };
}
```

- [x] **Step 4: Limpiar `upsert` y el DTO**

En `upsert`, eliminar la línea `const laborCost = sumByType(dto.items, [QuotationItemType.LABOR]);` y todas las referencias a `laborCost`; `taxable` pasa a ser `partsCost - discount`. Quitar `laborCost` de los objetos `create`/`update`. Cambiar el `status` que fija a `QuotationStatus.PENDING_REVIEW`, y **eliminar** de `upsert` el bloque que mueve la orden a `WAITING_APPROVAL` y el `this.whatsapp.notifyQuotationReady(...)` — eso ahora lo hace `createFromDiagnosis` y el envío es explícito (tarea 5). Si `WhatsappService` queda sin uso en este servicio, quitar la inyección.

- [x] **Step 5: Verificar y commitear (tareas 1 y 2 juntas)**

```bash
pnpm --filter @taller/api build && pnpm --filter @taller/api test
git add apps/api packages/shared
git commit -m "Turn a diagnosis with parts into a quotation awaiting review"
```

---

## Task 3: Backend — cambios de estado manuales

**Files:** `apps/api/src/orders/quotations/quotations.service.ts`, `quotations.controller.ts`, nuevo `dto/change-quotation-status.dto.ts`, nuevo `quotations.service.spec.ts`

- [x] **Step 1: DTO**

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { QuotationStatus } from '../../../generated/prisma/enums';

export class ChangeQuotationStatusDto {
  @ApiProperty({ enum: QuotationStatus })
  @IsEnum(QuotationStatus)
  status: QuotationStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
```

- [x] **Step 2: Transiciones permitidas**

A nivel de módulo en `quotations.service.ts`:

```ts
/**
 * Qué estados puede elegir una persona desde cada estado. Ningún cambio ocurre
 * solo: la única transición automática es la creación en PENDING_REVIEW desde
 * el diagnóstico.
 */
const QUOTATION_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT: [QuotationStatus.PENDING_REVIEW],
  PENDING_REVIEW: [QuotationStatus.READY_TO_SEND],
  READY_TO_SEND: [QuotationStatus.SENT, QuotationStatus.PENDING_REVIEW],
  SENT: [
    QuotationStatus.APPROVED,
    QuotationStatus.PARTIALLY_APPROVED,
    QuotationStatus.REJECTED,
  ],
  // Tras una aprobación parcial se ajusta y se vuelve a enviar, las veces que haga falta.
  PARTIALLY_APPROVED: [
    QuotationStatus.READY_TO_SEND,
    QuotationStatus.APPROVED,
    QuotationStatus.REJECTED,
  ],
  APPROVED: [],
  REJECTED: [],
};
```

- [x] **Step 3: `changeStatus`**

Reemplaza a `decide()`. Conserva el descuento de inventario y el movimiento de la orden que ya existían, ahora disparados solo por `APPROVED`:

```ts
  async changeStatus(
    tenantId: string,
    orderId: string,
    userId: string,
    dto: ChangeQuotationStatusDto,
  ) {
    const order = await this.ordersService.assertOrderExists(tenantId, orderId);
    const quotation = await this.prisma.quotation.findUnique({
      where: { orderId },
      include: { items: true },
    });
    if (!quotation) throw new NotFoundException('Cotización no encontrada');

    if (!QUOTATION_TRANSITIONS[quotation.status].includes(dto.status)) {
      throw new BadRequestException(
        `No se puede pasar de ${quotation.status} a ${dto.status}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          status: dto.status,
          approvedAt: dto.status === QuotationStatus.APPROVED ? new Date() : undefined,
          rejectedAt: dto.status === QuotationStatus.REJECTED ? new Date() : undefined,
        },
      });
      await tx.quotationStatusHistory.create({
        data: {
          quotationId: quotation.id,
          fromStatus: quotation.status,
          toStatus: dto.status,
          changedById: userId,
          notes: dto.notes,
        },
      });

      if (dto.status === QuotationStatus.APPROVED) {
        await this.consumeStock(tx, tenantId, orderId, order, quotation.items, userId);
      }
    });

    return this.findOne(tenantId, orderId);
  }
```

`consumeStock` es un método privado con el cuerpo que hoy está dentro de `decide()` (el bucle que descuenta `product.quantity`, crea el `InventoryMovement` y mueve la orden a `IN_REPAIR`/`WAITING_PARTS`), extraído tal cual salvo que `createdById` pasa a ser el `userId` que decide, no `order.receptionistId`. Borrar `decide()`.

- [x] **Step 4: Controller**

Reemplazar los endpoints `approve`/`reject` por uno solo:

```ts
  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Quotation')
  @Patch('status')
  changeStatus(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('orderId') orderId: string,
    @Body() dto: ChangeQuotationStatusDto,
  ) {
    return this.quotationsService.changeStatus(tenantId, orderId, userId, dto);
  }
```

`findOne` debe incluir `history` ordenado por `createdAt desc` con `changedBy: { select: { firstName: true, lastName: true } }`.

- [x] **Step 5: Tests**

`apps/api/src/orders/quotations/quotations.service.spec.ts`, con el patrón de instanciación directa del proyecto (ver `apps/api/src/reports/reports.service.spec.ts`). Cubrir: transición válida cambia el estado y escribe historial; transición inválida (p. ej. `PENDING_REVIEW → APPROVED`) lanza `BadRequestException`; `APPROVED` descuenta stock; `REJECTED` **no** lo toca; una cotización ya `SENT` no se pisa desde `createFromDiagnosis`.

- [x] **Step 6: Verificar y commitear**

```bash
pnpm --filter @taller/api build && pnpm --filter @taller/api test
git add apps/api/src/orders/quotations
git commit -m "Put every quotation status change in a person's hands"
```

---

## Task 4: Backend — el PDF

**Files:** nuevo `apps/api/src/common/pdf/quotation-pdf.service.ts`, `apps/api/src/common/pdf/pdf.module.ts`

- [x] **Step 1: El renderizador**

Servicio nuevo, no una variante del `generateDocument` genérico: el pedido pide expresamente un PDF que no se vea genérico, y el existente es para facturas.

```ts
import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface QuotationPdfData {
  tenant: { name: string; logoUrl?: string | null; primaryColor: string; address?: string | null; phone?: string | null; currency: string };
  quotationNumber: string;
  date: Date;
  clientName: string;
  vehicle: string;
  items: { description: string; quantity: number; unitPrice: number; subtotal: number }[];
  total: number;
  notes?: string | null;
  validityDays: number;
}

const INK = '#27272a';
const MUTED = '#71717a';
const ROW_ALT = '#f4f4f5';
const TEAL = '#0f766e';

@Injectable()
export class QuotationPdfService {
  private readonly logger = new Logger(QuotationPdfService.name);

  async render(data: QuotationPdfData): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const brand = data.tenant.primaryColor || '#ea580c';
    const money = (n: number) =>
      new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: data.tenant.currency || 'COP',
        maximumFractionDigits: 0,
      }).format(n);
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // ── Encabezado: logo, nombre, fecha y número ──────────────────────────
    const logo = await this.loadLogo(data.tenant.logoUrl);
    if (logo) {
      try {
        doc.image(logo, left, 45, { fit: [70, 70] });
      } catch {
        // Un logo corrupto no puede tumbar la cotización.
      }
    }
    doc.fillColor(brand).fontSize(22).font('Helvetica-Bold')
      .text(data.tenant.name.toUpperCase(), left + (logo ? 85 : 0), 55);
    doc.fillColor(TEAL).fontSize(10).font('Helvetica')
      .text('Motos eléctricas', left + (logo ? 85 : 0), 82);
    doc.fillColor(INK).fontSize(9).font('Helvetica')
      .text(data.date.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }), left, 55, { width, align: 'right' })
      .font('Helvetica-Bold')
      .text(`Cotización N.º ${data.quotationNumber}`, left, 69, { width, align: 'right' });

    doc.moveTo(left, 130).lineTo(right, 130).lineWidth(2).strokeColor(brand).stroke();

    // ── Saludo e introducción ─────────────────────────────────────────────
    doc.fillColor(INK).fontSize(15).font('Helvetica-Bold').text(`Estimado ${data.clientName},`, left, 155);
    doc.fontSize(9.5).font('Helvetica').fillColor(INK).moveDown(0.8);
    doc.text(
      `Reciba un cordial saludo de parte del equipo de ${data.tenant.name}. A continuación ponemos a su disposición la cotización correspondiente a la orden N.º ${data.quotationNumber}, para su vehículo ${data.vehicle}, con el detalle de los repuestos, sus valores individuales y el total a pagar.`,
      { width, align: 'left' },
    );

    doc.moveDown(1.2);
    doc.fontSize(12).font('Helvetica-Bold').text('Detalle de la cotización');
    doc.moveDown(0.5);

    // ── Tabla ─────────────────────────────────────────────────────────────
    // Cuatro columnas: el PDF de referencia solo trae Ítem|Valor, pero el
    // pedido exige cantidad y valor unitario.
    const cols = [width - 240, 50, 95, 95];
    const x = [left, left + cols[0], left + cols[0] + cols[1], left + cols[0] + cols[1] + cols[2]];
    const rowH = 26;
    let y = doc.y;

    const row = (cells: string[], opts: { fill?: string; color?: string; bold?: boolean }) => {
      if (opts.fill) doc.rect(left, y, width, rowH).fill(opts.fill);
      doc.fillColor(opts.color ?? INK).fontSize(9).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
      cells.forEach((cell, i) => {
        doc.text(cell, x[i] + 8, y + 8, {
          width: cols[i] - 16,
          align: i === 0 ? 'left' : 'right',
          lineBreak: false,
        });
      });
      y += rowH;
    };

    row(['Ítem', 'Cant.', 'V. unitario', 'V. total'], { fill: INK, color: '#ffffff', bold: true });
    data.items.forEach((item, i) => {
      row(
        [item.description, String(item.quantity), money(item.unitPrice), money(item.subtotal)],
        { fill: i % 2 === 1 ? ROW_ALT : undefined },
      );
    });
    row(['TOTAL', '', '', money(data.total)], { fill: brand, color: '#ffffff', bold: true });

    doc.y = y + 20;

    // ── Cajas de aviso ────────────────────────────────────────────────────
    const callout = (title: string, body: string, accent: string, bg: string) => {
      const boxY = doc.y;
      const h = 52;
      doc.rect(left, boxY, width, h).fill(bg);
      doc.rect(left, boxY, 4, h).fill(accent);
      doc.fillColor(accent).fontSize(9.5).font('Helvetica-Bold').text(title, left + 16, boxY + 9, { width: width - 32 });
      doc.fillColor(INK).fontSize(8.5).font('Helvetica').text(body, left + 16, boxY + 24, { width: width - 32 });
      doc.y = boxY + h + 12;
    };

    callout(
      'Validez de la cotización',
      `Esta cotización tiene una validez de ${data.validityDays} días calendario a partir de la fecha de emisión. Pasado este periodo, los precios y la disponibilidad de los productos podrán estar sujetos a cambios.`,
      TEAL,
      '#ecfdf5',
    );
    callout(
      'Recordatorio de pago',
      'El pago puede realizarse de manera anticipada, o en el momento en que recoja el vehículo en nuestras instalaciones.',
      brand,
      '#fff7ed',
    );

    doc.fillColor(MUTED).fontSize(8.5).font('Helvetica-Oblique')
      .text('Nota: esta cotización ya incluye el valor de la mano de obra correspondiente a la instalación de los ítems detallados.', left, doc.y, { width });

    if (data.notes) {
      doc.moveDown(0.8).fillColor(INK).fontSize(9).font('Helvetica').text(data.notes, { width });
    }

    doc.moveDown(1).fillColor(INK).fontSize(9).font('Helvetica')
      .text('Quedamos atentos a cualquier duda, comentario o ajuste que desee realizar sobre esta cotización.', { width });
    doc.moveDown(0.8).text('Atentamente,');
    doc.fillColor(brand).font('Helvetica-Bold').text(`El equipo de ${data.tenant.name}`);

    // ── Pie ───────────────────────────────────────────────────────────────
    const footY = doc.page.height - doc.page.margins.bottom - 46;
    doc.rect(left, footY, width, 46).fill(INK);
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
      .text(data.tenant.name, left, footY + 10, { width, align: 'center' });
    doc.fontSize(8).font('Helvetica').fillColor('#d4d4d8')
      .text(
        [data.tenant.address, data.tenant.phone && `Tel: ${data.tenant.phone}`].filter(Boolean).join('  ·  '),
        left,
        footY + 25,
        { width, align: 'center' },
      );

    doc.end();
    return done;
  }

  /** Lee el logo del disco. Solo rutas locales de /uploads; una URL externa se ignora. */
  private async loadLogo(logoUrl?: string | null): Promise<Buffer | null> {
    if (!logoUrl?.startsWith('/uploads/')) return null;
    try {
      return await fs.readFile(path.join(process.cwd(), logoUrl.replace('/uploads/', 'uploads/')));
    } catch {
      this.logger.warn(`No se pudo leer el logo ${logoUrl}; se omite`);
      return null;
    }
  }
}
```

- [x] **Step 2: Registrarlo**

En `apps/api/src/common/pdf/pdf.module.ts`, agregar `QuotationPdfService` a `providers` y `exports` (el módulo ya es `@Global()`).

- [x] **Step 3: Verificar que produce un PDF válido**

Test mínimo, `quotation-pdf.service.spec.ts`: renderizar con dos ítems y comprobar que el Buffer empieza con `%PDF` y pesa más de 1 KB; y que un `logoUrl` inexistente no lanza.

```bash
pnpm --filter @taller/api build && pnpm --filter @taller/api test
git add apps/api/src/common/pdf
git commit -m "Render quotations as a PDF in the workshop's own format"
```

---

## Task 5: Backend — generar el PDF y preparar el envío

**Files:** `apps/api/src/orders/quotations/quotations.service.ts`, `quotations.controller.ts`

- [x] **Step 1: `generatePdf`**

Inyectar `QuotationPdfService` y `StorageService`. Método nuevo:

```ts
  /** Genera el PDF y deja la cotización lista para enviar. */
  async generatePdf(tenantId: string, orderId: string, userId: string) {
    const order = await this.ordersService.findOne(tenantId, orderId);
    const quotation = await this.findOne(tenantId, orderId);

    if (!EDITABLE_STATUSES.includes(quotation.status)) {
      throw new BadRequestException('Esta cotización ya no se puede modificar');
    }
    if (quotation.items.length === 0) {
      throw new BadRequestException('La cotización no tiene repuestos');
    }
    // Un repuesto sin producto de inventario llega en cero desde el diagnóstico;
    // quien revisa tiene que ponerle precio antes de que el cliente lo vea.
    const sinPrecio = quotation.items.filter((i) => Number(i.unitPrice) <= 0);
    if (sinPrecio.length > 0) {
      throw new BadRequestException(
        `Falta el precio de: ${sinPrecio.map((i) => i.description).join(', ')}`,
      );
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const buffer = await this.quotationPdf.render({
      tenant,
      quotationNumber: order.orderNumber,
      date: new Date(),
      clientName: `${order.client.firstName} ${order.client.lastName}`,
      vehicle: `${order.motorcycle.brand} ${order.motorcycle.model}`,
      items: quotation.items.map((i) => ({
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        subtotal: Number(i.subtotal),
      })),
      total: Number(quotation.total),
      notes: quotation.notes,
      validityDays: QUOTATION_VALIDITY_DAYS,
    });

    const pdfUrl = await this.storage.upload(
      buffer,
      `cotizacion-${order.orderNumber}.pdf`,
      'application/pdf',
      'quotations',
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: quotation.id },
        data: { pdfUrl, status: QuotationStatus.READY_TO_SEND },
      });
      await tx.quotationStatusHistory.create({
        data: {
          quotationId: quotation.id,
          fromStatus: quotation.status,
          toStatus: QuotationStatus.READY_TO_SEND,
          changedById: userId,
          notes: 'PDF generado',
        },
      });
    });

    return this.findOne(tenantId, orderId);
  }
```

Con `const QUOTATION_VALIDITY_DAYS = 8;` a nivel de módulo.

- [x] **Step 2: `prepareSend`**

Reutiliza el mecanismo de envío que ya existe: crea una `Notification` con el enlace del PDF; el botón de WhatsApp de `/notifications` (y el de la orden) hace el resto.

```ts
  /** Deja el mensaje listo en la bandeja de notificaciones y marca la cotización como enviada. */
  async prepareSend(tenantId: string, orderId: string, userId: string) {
    const order = await this.ordersService.findOne(tenantId, orderId);
    const quotation = await this.findOne(tenantId, orderId);
    if (!quotation.pdfUrl) {
      throw new BadRequestException('Primero genera el PDF de la cotización');
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const baseUrl = this.config.get<string>('PUBLIC_URL') ?? 'http://localhost:3001';
    const message =
      `Hola ${order.client.firstName}. Le compartimos la cotización de los repuestos para su vehículo (Orden #${order.orderNumber}).\n\n` +
      `Puede verla aquí: ${baseUrl}${quotation.pdfUrl}\n\n` +
      `Quedamos atentos a su aprobación para continuar con la reparación.\nEquipo ${tenant.name}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.notification.create({
        data: {
          tenantId,
          orderId,
          toStatus: order.status,
          message,
          createdById: userId,
        },
      });
      await tx.quotation.update({
        where: { id: quotation.id },
        data: { status: QuotationStatus.SENT, sentAt: new Date() },
      });
      await tx.quotationStatusHistory.create({
        data: {
          quotationId: quotation.id,
          fromStatus: quotation.status,
          toStatus: QuotationStatus.SENT,
          changedById: userId,
          notes: 'Mensaje preparado para enviar por WhatsApp',
        },
      });
    });

    return this.findOne(tenantId, orderId);
  }
```

Inyectar `ConfigService`. Agregar `PUBLIC_URL=http://localhost:3001` a `apps/api/.env.example` (y a `.env` si existe) con un comentario: es la base del enlace que ve el cliente; en producción debe ser el dominio público.

- [x] **Step 3: Endpoints**

```ts
  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Quotation')
  @Post('pdf')
  generatePdf(...) { return this.quotationsService.generatePdf(tenantId, orderId, userId); }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Quotation')
  @Post('send')
  send(...) { return this.quotationsService.prepareSend(tenantId, orderId, userId); }
```

- [x] **Step 4: Verificar y commitear**

Probar contra la API corriendo: crear diagnóstico con repuesto, poner precio, generar PDF, abrir la URL devuelta y confirmar que el PDF se descarga.

```bash
git add apps/api/src/orders/quotations apps/api/.env.example
git commit -m "Generate the quotation PDF and queue it for WhatsApp"
```

---

## Task 6: Frontend — la pestaña de cotización

**Files:** `apps/web/src/lib/types.ts`, `apps/web/src/components/orders/quotation-tab.tsx`

- [x] **Step 1: Tipos**

En `types.ts`, actualizar `Quotation`: `status` pasa a los 7 valores, agregar `pdfUrl?: string | null`, `sentAt?: string | null`, `history?: QuotationStatusHistory[]`, y quitar `laborCost`. Agregar la interfaz del historial.

- [x] **Step 2: La pestaña**

Se conserva el editor de ítems que ya existe (agregar/quitar fila, descripción, cantidad, precio) y se le suma alrededor:

- Un `Badge` con el estado actual, usando `QUOTATION_STATUS_LABELS`.
- El editor solo se habilita si el estado está en `DRAFT/PENDING_REVIEW/READY_TO_SEND/PARTIALLY_APPROVED`; en `SENT/APPROVED/REJECTED` se muestra en solo lectura.
- Quitar `LABOR` de `TYPE_LABELS`.
- Resaltar en rojo los ítems con precio 0 y un aviso: "Ponle precio a todos los repuestos antes de generar el PDF".
- Botonera según el estado:
  - editable → **Guardar cambios** (`PUT`), **Generar PDF** (`POST /pdf`)
  - con `pdfUrl` → **Ver PDF** (abre `API_ORIGIN + pdfUrl`)
  - `READY_TO_SEND` → **Enviar por WhatsApp** (`POST /send`, y luego abre `wa.me` con el mensaje — reutilizar `toWhatsappPhone` de `@/lib/phone`)
  - `SENT` → **Aprobada**, **Aprobada parcialmente**, **Rechazada** (`PATCH /status` con un campo de observaciones opcional)
  - `PARTIALLY_APPROVED` → se vuelve a habilitar el editor y aparece **Generar PDF** otra vez
- Una lista con el historial de estados (quién, cuándo, de qué a qué, observaciones).

- [x] **Step 3: Verificar y commitear**

```bash
pnpm --filter @taller/web build
git add apps/web
git commit -m "Rebuild the quotation tab around its review-and-send flow"
```

---

## Task 7: Frontend — contador en el menú

**Files:** `apps/web/src/components/layout/sidebar-nav.tsx` (o donde se rendericen los `NAV_ITEMS`)

- [x] **Step 1: El contador**

Junto al ítem "Órdenes", mostrar cuántas órdenes están en `WAITING_APPROVAL` para ADMIN/MANAGER/RECEPTIONIST, usando el endpoint de listado que ya existe:

```tsx
const { data } = useApiSWR<PaginatedResult<Order>>(
  canReview ? '/orders?status=WAITING_APPROVAL&pageSize=1' : null,
);
```

y pintar `data.total` como badge si es mayor que cero. Sin endpoint nuevo: se aprovecha el `total` que ya devuelve la lista paginada.

- [x] **Step 2: Verificar y commitear**

```bash
pnpm --filter @taller/web build
git add apps/web
git commit -m "Badge orders waiting on a quotation review"
```

---

## Task 8: Verificación final

- [x] **Step 1: Build, tests y lint**

```bash
pnpm --filter @taller/api build && pnpm --filter @taller/api test
pnpm --filter @taller/web build
cd apps/api && npx eslint src/orders/ src/common/pdf/
```
(No correr `pnpm lint`: reformatea todo el repo y se cuelga.)

- [x] **Step 2: Prueba manual del flujo completo**

- [x] Técnico: diagnóstico **sin** repuestos → guardar → la orden NO pasa a Esperando aprobación y no hay cotización.
- [x] Técnico: agregar un repuesto → guardar → la orden pasa a Esperando aprobación, aparece la cotización en "Esperando revisión", y el inventario **no** se movió.
- [x] Admin: el menú muestra el contador. Editar ítems y precios, guardar.
- [x] Generar PDF con un ítem en 0 → error pidiendo el precio. Ponerle precio → PDF generado.
- [x] Abrir el PDF: logo, colores del taller, tabla de 4 columnas, total, cajas de validez y pago, pie.
- [x] Enviar por WhatsApp: se abre WhatsApp con el mensaje y el enlace; abrir el enlace en una ventana privada (sin sesión) y confirmar que el PDF se ve.
- [x] Marcar **Aprobada** → el inventario se descuenta una sola vez, la orden pasa a En reparación (o Esperando repuestos si falta stock).
- [x] En otra orden, marcar **Rechazada** → el inventario no se toca.
- [x] En otra, **Aprobada parcialmente** → se puede editar, regenerar PDF y reenviar.
- [x] El historial muestra cada cambio con usuario, fecha, estado anterior y nuevo.
- [x] Técnico: sigue sin ver la pestaña Cotización.
