# Ajustes al asistente de nueva orden (Grupo A) — Diseño

**Fecha:** 2026-07-23
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## 1. Objetivo

Tres mejoras puntuales al asistente de creación de órdenes y a la lista de órdenes, ya construidos y en uso:

1. Checklist administrable de accesorios entregados por el cliente al ingresar el vehículo.
2. Corrección del número usado para el link de WhatsApp (falta el indicativo de país).
3. Fila completa de la lista de órdenes clickeable hacia el detalle.

## 2. A1 — Checklist de accesorios entregados

### Decisión de alcance
El catálogo de accesorios es **administrable desde Configuración** (no una lista fija en el código), con la misma mecánica que "Servicios rápidos": CRUD + reordenar. Se implementa como un **sistema paralelo e independiente** de `QuickService` (nuevo modelo `AccessoryOption`, nuevo módulo, nuevo panel), en vez de generalizar `QuickService` para sostener ambos casos — así no se toca un sistema que ya está construido, revisado y en producción. Es algo de código duplicado (un modelo y un módulo pequeños), aceptado conscientemente.

### Modelo de datos

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

`Tenant` gana la relación inversa `accessoryOptions AccessoryOption[]`.

### Backend

Módulo nuevo `apps/api/src/accessory-options/` — copia estructural exacta de `apps/api/src/quick-services/` (mismo patrón de controller/service/module/dto), incluyendo **desde el inicio** las dos correcciones que ya aprendimos al construir `quick-services` (para no repetir la misma ronda de revisión):
- Verificación de etiqueta duplicada por tenant antes de crear/editar, devolviendo `ConflictException` (409) en vez de un error crudo de Prisma.
- `reorder` valida que todos los ids pertenezcan al tenant antes de escribir.

Endpoints: `GET /accessory-options` (cualquier autenticado), `POST` / `PATCH /:id` / `DELETE /:id` / `PATCH /reorder` (ADMIN, MANAGER).

### Integración con la orden

El campo `Order.accessoriesDelivered` (`String?`) **ya existe** en el schema y **ya se muestra** en la página de detalle de la orden (`{order.accessoriesDelivered && <p>Accesorios: {...}</p>}`) — no requiere cambios de schema ni de esa página. Lo que falta es que el nuevo asistente lo alimente (hoy no envía nada a ese campo).

Combinación servidor-side, igual que ya se hace con `reason` (etiquetas de servicios rápidos + descripción): el asistente envía `accessoryOptionIds: string[]` (ids de las casillas marcadas) + `otherAccessoryText?: string` (el texto de "Otro"), y `OrdersService.intake()` resuelve los ids a etiquetas dentro de la transacción y las combina con una nueva utilidad pura (con test, igual que `buildIntakeReason`):

```ts
// apps/api/src/orders/intake-accessories.util.ts
export function buildAccessoriesText(labels: string[], otherText: string): string | undefined {
  const combined = [labels.join(', '), otherText.trim()].filter((part) => part !== '').join(', ');
  return combined === '' ? undefined : combined;
}
```

`IntakeOrderDto` gana `accessoryOptionIds?: string[]` (mismo patrón `@Transform` de JSON-string-desde-multipart que `quickServiceIds`) y `otherAccessoryText?: string` (opcional).

### Frontend

- `apps/web/src/lib/types.ts`: nueva interfaz `AccessoryOption` (idéntica forma a `QuickService`).
- Nuevo componente `apps/web/src/components/orders/accessory-checklist.tsx`: casillas por cada `AccessoryOption` activo + una casilla fija "Otro" que revela un `Input` de texto libre al marcarla.
- Asistente (`apps/web/src/app/(app)/orders/new/page.tsx`): nuevo paso `'accessories'` insertado entre `'vehicle'` y `'reason'` en `STEP_ORDER`/`STEP_LABELS`; nuevo estado `selectedAccessoryIds: string[]`, `otherAccessoryChecked: boolean`, `otherAccessoryText: string`; fetch `useApiSWR<AccessoryOption[]>('/accessory-options')`; `handleSubmit` agrega `accessoryOptionIds` (si hay alguno) y `otherAccessoryText` (si "Otro" está marcado y tiene texto) al `FormData`. Este paso no es obligatorio (se puede continuar sin marcar nada — no todos los ingresos traen accesorios).
- Configuración: nueva pestaña "Accesorios" en `apps/web/src/app/(app)/settings/page.tsx`, con `AccessoryOptionsSettings`/`AccessoryOptionForm` — copia estructural de `QuickServicesSettings`/`QuickServiceForm`, incluyendo **desde el inicio** las correcciones ya aprendidas ahí: manejo de errores en mover/eliminar con toast, guarda contra doble-clic mientras reordena, `aria-label` en los botones de mover.

## 3. A2 — Indicativo de país en el link de WhatsApp

Causa confirmada: un número guardado sin indicativo (ej. `3105551234`, 10 dígitos) hace que WhatsApp interprete mal los primeros dígitos como si fueran un código de país, produciendo el error de "número no existe".

Nueva utilidad `apps/web/src/lib/phone.ts`:

```ts
export function toWhatsappPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  return digits;
}
```

Se asume Colombia (`57`) como indicativo por defecto, ya que este taller opera ahí (moneda COP, IVA 19% en los datos de ejemplo) — no se construye un selector de país. Si el número ya trae indicativo (más de 10 dígitos, o no empieza en `3`), se deja tal cual.

Uso: en `apps/web/src/app/(app)/orders/new/page.tsx`, `handleSubmit` reemplaza `order.client.phone.replace(/\D/g, '')` por `toWhatsappPhone(order.client.phone)`.

## 4. A3 — Fila de orden clickeable

En `apps/web/src/app/(app)/orders/page.tsx`, cada `<TableRow>` del cuerpo de la tabla gana `onClick={() => router.push(\`/orders/${order.id}\`)}` + `className="cursor-pointer hover:bg-muted/50"`. El `<Link>` existente sobre el número de orden se mantiene (no genera conflicto: lleva al mismo destino).

## 5. Testing

Sigue el patrón ya establecido: prueba unitaria para `buildAccessoriesText` (pura, con test, como `buildIntakeReason`). `toWhatsappPhone` es frontend puro sin infraestructura de test en `apps/web` — se implementa con cuidado y se verifica manualmente, igual que el resto de utilidades de frontend en este proyecto.
