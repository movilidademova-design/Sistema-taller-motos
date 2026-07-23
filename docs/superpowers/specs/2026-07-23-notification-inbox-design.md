# Inbox de notificaciones de cambio de estado — Diseño

**Fecha:** 2026-07-23
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## 1. Objetivo

Hoy, cuando una orden cambia de estado (`PATCH /orders/:id/status`) o se entrega el vehículo (`POST /orders/:id/deliver`), el sistema intenta notificar al cliente de forma automática y silenciosa vía un stub de WhatsApp que en la práctica no hace nada real (`NoopWhatsappProvider`, solo registra un log). No existe ningún inbox de notificaciones pendientes, ni se le pregunta a quien cambia el estado si desea avisar al cliente.

Este diseño reemplaza ese mecanismo silencioso por un flujo explícito de dos pasos: el cambio de estado ocurre normalmente, y justo después se pregunta si se desea generar una notificación para el cliente. Si la respuesta es sí, se crea una notificación interna pendiente que el personal de Admin/Gerente/Recepción puede atender desde un inbox, enviándola por WhatsApp (link `wa.me`, mismo patrón que el asistente de ingreso), por correo (envío real vía el `EmailService` existente), o copiándola al portapapeles.

## 2. Alcance de las preguntas ya resueltas

- El diálogo "¿Desea generar una notificación para el cliente?" aparece para **cualquier rol** que cambie el estado (no solo Técnico) — más simple y consistente, ya que de todas formas solo Admin/Gerente/Recepción ven el inbox después.
- Aplica también a la **entrega del vehículo** (`POST /orders/:id/deliver`), no solo al cambio de estado genérico — con un mensaje de agradecimiento en ese caso.
- El envío automático/silencioso actual (`OrdersService.notifyStatusChange`, las llamadas a `whatsapp.notifyInRepair`/`notifyReadyForPickup`/`sendThankYou`) se **elimina por completo**, reemplazado uniformemente por este flujo.
- El mensaje se **arma y guarda en el momento de crear la notificación** (inmutable desde ahí) — no se recalcula después, igual que el patrón ya usado en el mensaje de confirmación del asistente de ingreso.
- No se agrega push en tiempo real (websockets): el backend ya tiene un gateway de Socket.IO (`RealtimeGateway`), pero el frontend **nunca se conecta a él** hoy (no existe `socket.io-client` en `apps/web`) — construir esa conexión desde cero sería alcance nuevo no relacionado con este feature. El contador de pendientes se actualiza por polling normal vía SWR, igual que el resto de la app.
- El diálogo de confirmación aparece para **cualquier estado destino**, incluyendo `CANCELLED`/`WARRANTY` — no se restringe a un subconjunto de estados "de progreso". Quien cambia el estado decide caso por caso si tiene sentido avisar al cliente.

## 3. Modelo de datos

Nuevo modelo `Notification`, análogo en estructura a `OrderStatusHistory` (mismo patrón de tenant + order + usuario + timestamps ya usado en este codebase):

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

model Notification {
  id          String                @id @default(uuid())
  tenantId    String
  tenant      Tenant                @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  orderId     String
  order       Order                 @relation(fields: [orderId], references: [id], onDelete: Cascade)
  toStatus    OrderStatus
  message     String
  status      NotificationStatus    @default(PENDING)
  createdById String
  createdBy   User                  @relation("NotificationCreatedBy", fields: [createdById], references: [id])
  sentAt      DateTime?
  sentById    String?
  sentBy      User?                 @relation("NotificationSentBy", fields: [sentById], references: [id])
  sentVia     NotificationChannel?
  createdAt   DateTime              @default(now())

  @@index([tenantId, status])
  @@map("notifications")
}
```

`Tenant`, `Order`, y `User` ganan las relaciones inversas correspondientes.

## 4. Backend

### 4.1 Cambios a endpoints existentes

- `apps/api/src/orders/orders.service.ts`: se elimina el método privado `notifyStatusChange` y su invocación fire-and-forget al final de `updateStatus` y `deliver`. El cambio de estado / la entrega quedan funcionalmente igual en todo lo demás (transición, historial, `pickupCode`, etc.) — solo se quita el intento de notificación automática.

### 4.2 Endpoint nuevo: generar notificación

`POST /orders/:id/notify` — mismos roles que ya pueden cambiar el estado de una orden (`ADMIN, MANAGER, RECEPTIONIST, TECHNICIAN`; nótese que esto cubre también a quien hizo la entrega, ya que ese endpoint solo permite `ADMIN, MANAGER, RECEPTIONIST`, un subconjunto).

- No requiere body. Lee el estado **actual** de la orden (`order.status`) para construir el mensaje.
- Construye el mensaje vía una utilidad pura y testeada (ver 4.4).
- Crea el registro `Notification` (`status: PENDING`).
- Devuelve la notificación creada.

### 4.3 Módulo nuevo: `NotificationsModule`

Roles en todos los endpoints: `ADMIN, MANAGER, RECEPTIONIST` (igual que quién ya gestiona comunicación con el cliente hoy — creación/entrega/envío del mensaje de ingreso; Técnico dispara el diálogo pero no administra el inbox).

- `GET /notifications?status=PENDING|SENT&page=&pageSize=` — lista paginada, más reciente primero. Incluye datos de la orden y el cliente (número de orden, nombre, teléfono, correo) necesarios para que el frontend arme el link de WhatsApp y sepa si mostrar el botón de correo.
- `POST /notifications/:id/send-email` — requiere que el cliente tenga correo (400 si no); llama a un método nuevo en `EmailService` que envía el `message` ya guardado tal cual; marca `status: SENT`, `sentVia: EMAIL`, `sentById`, `sentAt`.
- `POST /notifications/:id/mark-sent` — body `{ channel: 'WHATSAPP' | 'COPY' }`. Para WhatsApp y Copiar, la acción real (abrir el link `wa.me`, escribir al portapapeles) ocurre en el navegador del usuario — igual que en el asistente de ingreso — así que este endpoint solo registra que ya se hizo. Debe rechazar (400) si la notificación ya estaba `SENT`, para evitar doble registro.

### 4.4 Utilidad de mensaje (pura, con test unitario)

```ts
// apps/api/src/orders/notification-message.util.ts
export function buildStatusChangeMessage(params: {
  clientFirstName: string;
  orderNumber: number;
  status: OrderStatus;
  statusLabel: string;
  tenantName: string;
}): string {
  if (params.status === 'DELIVERED') {
    return `Hola ${params.clientFirstName}. Gracias por confiar en nosotros — tu vehículo (Orden #${params.orderNumber}) fue entregado exitosamente. ¡Será un gusto atenderte de nuevo!\nEquipo ${params.tenantName}`;
  }
  return `Hola ${params.clientFirstName}. Tu vehículo (Orden #${params.orderNumber}) cambió de estado a: ${params.statusLabel}.\nCualquier duda, contáctanos.\nEquipo ${params.tenantName}`;
}
```

La forma exacta de obtener `tenantName` debe seguir el mismo patrón ya usado por `OrdersService` para `sendIntakeConfirmationEmail` (que ya necesita el nombre del tenant para el correo de confirmación de ingreso) — se detalla en el plan de implementación.

## 5. Frontend

### 5.1 Diálogo de confirmación tras cambiar estado / entregar

En `apps/web/src/app/(app)/orders/[id]/page.tsx`, tanto `StatusChanger` como `DeliverVehicleDialog`, tras el éxito de su llamada actual (`PATCH .../status` o `POST .../deliver`), muestran un diálogo simple: **"¿Desea generar una notificación para el cliente?"** con botones Sí/No.

- "No" — cierra el diálogo, no pasa nada más.
- "Sí" — llama `POST /orders/:id/notify`, muestra un toast de éxito, cierra el diálogo.

### 5.2 Campana en el topbar

`apps/web/src/components/layout/topbar.tsx` gana un ícono de campana (junto al `ThemeToggle`), **solo visible si `user.role` es `ADMIN`, `MANAGER`, o `RECEPTIONIST`**. Muestra el conteo de pendientes (de `GET /notifications?status=PENDING&pageSize=5`, usando el total de la respuesta paginada) como badge, y un dropdown con las 5 más recientes (orden, cliente, vista previa del mensaje, botones de acción) + un link "Ver todas" hacia `/notificaciones`.

### 5.3 Página `/notificaciones`

Nueva página bajo `apps/web/src/app/(app)/notificaciones/page.tsx` (o `notifications/`, a definir en el plan según convención de rutas existente), con pestañas **Pendiente** / **Notificada**, listando cada notificación con: orden, cliente, mensaje, timestamps, y — solo si está pendiente — los tres botones de acción (WhatsApp / Correo / Copiar), reutilizando `toWhatsappPhone()` de `apps/web/src/lib/phone.ts` (ya construido en el Grupo A) para el link de WhatsApp.

### 5.4 Botones de acción (componente compartido entre dropdown y página completa)

- **WhatsApp**: si el cliente tiene teléfono, abre `https://wa.me/${toWhatsappPhone(phone)}?text=${encodeURIComponent(message)}` en pestaña nueva, luego llama `POST /notifications/:id/mark-sent` con `{ channel: 'WHATSAPP' }`.
- **Correo**: si el cliente tiene correo, llama `POST /notifications/:id/send-email` (el backend envía y marca como enviado en un solo paso).
- **Copiar**: siempre visible; `navigator.clipboard.writeText(message)`, luego llama `mark-sent` con `{ channel: 'COPY' }`.

Si el cliente no tiene ni teléfono ni correo, se muestra solo el botón de copiar (igual que ya ocurre en el asistente de ingreso).

## 6. Testing

Sigue el patrón ya establecido: prueba unitaria para `buildStatusChangeMessage` (pura, con casos para transición normal y para `DELIVERED`), igual que `buildIntakeReason`/`buildAccessoriesText`. El resto se verifica manualmente (build + smoke test), como el resto del frontend en este proyecto.
