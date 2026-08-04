# Módulo de Cotizaciones — Diseño

**Fecha:** 2026-08-04
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

Los requisitos funcionales los redactó el usuario y se dan por conocidos. Este documento registra únicamente **qué se reutiliza, qué se construye y en qué me aparto del texto original** — no los repite.

## 1. Lo que ya existe y se reutiliza

Buena parte del módulo ya está construida; lo que falta es conectarla.

| Pieza | Estado hoy |
|---|---|
| `Quotation` + `QuotationItem` | Existen con ítems, descuento, impuesto y total |
| Aprobación que descuenta inventario y mueve la orden | Existe en `QuotationsService.decide()` |
| PDF | `PdfService` con `pdfkit` — ya instalado, sin Chromium |
| Almacenamiento del PDF | `StorageService` escribe en `/uploads`, servido **público** por `main.ts` |
| Envío por WhatsApp | **Ya existe completo**: `toWhatsappPhone()`, botón que abre `wa.me`, y `POST /notifications/:id/mark-sent` |
| Marca de canal (WhatsApp/Email/Copiar) | `NotificationChannel` + página `/notifications` |
| Datos del taller para el PDF | `Tenant.logoUrl`, `primaryColor`, `address`, `phone`, `email`, `taxId`, `currency` |
| Auditoría de usuario + fecha | Decorador `@Audit()` + `AuditInterceptor` → `AuditLog` |

**Consecuencia para el punto 4 del pedido ("envío por WhatsApp"):** no se construye nada nuevo. Enviar una cotización = crear una fila de `Notification` cuyo mensaje incluye el enlace al PDF. El botón de WhatsApp, la apertura del chat y el registro de "enviada" ya funcionan y se aprovechan tal cual.

## 2. Decisiones tomadas con el usuario

- **WhatsApp por enlace `wa.me`, no por API de Meta.** El personal presiona "Enviar por WhatsApp", se abre su WhatsApp con el mensaje ya escrito incluyendo el enlace al PDF, y lo envía. Costo cero, sin infraestructura, sin verificación de Meta ni aprobación de plantillas.
  **Limitación aceptada:** `wa.me` no adjunta archivos, solo texto — por eso el PDF viaja como enlace. La API de Meta (que sí adjunta el archivo) queda para más adelante; el `WhatsappProvider` de `whatsapp.service.ts` ya está diseñado para que eso sea un cambio de un solo archivo.
- **El inventario sale al aprobar la cotización, no al diagnosticar.** Hoy `DiagnosisService.addPart` descuenta stock y `QuotationsService.decide` lo descuenta otra vez. Al conectar ambos flujos eso duplicaría el descuento. Se elimina el movimiento de inventario del diagnóstico: el técnico solo lista los repuestos que hacen falta. Si el cliente rechaza, nunca salió nada del inventario.
- **Aviso al personal = contador en el menú**, no un sistema de notificaciones internas. Las cotizaciones por revisar se ven como un número junto a "Órdenes" y un filtro por estado. No se crea tabla ni bandeja nueva.
- **La mano de obra no es un concepto separado.** Se eliminan `Quotation.laborCost` y `QuotationItemType.LABOR`; el precio de cada repuesto ya la incluye.

## 3. En qué me aparto del texto del pedido

1. **La tabla del PDF lleva 4 columnas, no 2.** El PDF de referencia muestra solo `Ítem | Valor`, pero el pedido exige cantidad y valor unitario. Queda: **Ítem | Cant. | V. unitario | V. total**. Todo lo demás del diseño se respeta.
2. **El PDF queda en una URL pública.** Es lo que permite al cliente abrirlo desde WhatsApp sin cuenta ni sesión. La URL lleva un UUID aleatorio, así que no es adivinable, pero cualquiera que la tenga puede verla. Es una consecuencia inevitable de enviar por enlace.
3. **"Notificar a los usuarios de la sede" no genera notificaciones**, por la decisión de arriba.

## 4. Modelo de datos

```prisma
enum QuotationStatus {
  DRAFT               // creada, aún sin repuestos o incompleta
  PENDING_REVIEW      // el técnico terminó el diagnóstico; falta revisión administrativa
  READY_TO_SEND       // revisada, PDF generado
  SENT                // enviada al cliente
  APPROVED
  PARTIALLY_APPROVED
  REJECTED
}

enum QuotationItemType {
  PART
  OTHER              // LABOR eliminado
}

model Quotation {
  // ...campos existentes, menos laborCost...
  pdfUrl  String?
  sentAt  DateTime?
  history QuotationStatusHistory[]
}

model QuotationStatusHistory {
  id          String          @id @default(uuid())
  quotationId String
  quotation   Quotation       @relation(fields: [quotationId], references: [id], onDelete: Cascade)
  fromStatus  QuotationStatus?
  toStatus    QuotationStatus
  changedById String
  changedBy   User            @relation(fields: [changedById], references: [id], onDelete: Restrict)
  notes       String?
  createdAt   DateTime        @default(now())

  @@index([quotationId])
  @@map("quotation_status_history")
}
```

`QuotationStatusHistory` es un espejo exacto de `OrderStatusHistory`, que ya existe y ya se muestra en la pestaña Historial de la orden. Se reutiliza ese patrón en vez de inventar uno, y la pestaña Historial pasa a mostrar ambas listas juntas.

**Por qué una tabla y no `AuditLog`:** `AuditLog` guarda el cuerpo de la petición en un `Json`, así que registra el estado nuevo pero no el anterior. El pedido exige explícitamente "estado anterior / estado nuevo".

## 5. Flujo

```
Técnico guarda diagnóstico
  ├── sin repuestos  → nada, la orden sigue su curso
  └── con repuestos  → Quotation(PENDING_REVIEW) con un ítem por repuesto
                       Orden → Esperando aprobación

Admin/Manager/Recepción revisa:  edita ítems, cantidades, precios, observaciones
  → "Generar cotización"  → PDF + READY_TO_SEND
  → "Enviar por WhatsApp" → crea Notification con el enlace + SENT
                            (el botón wa.me que ya existe hace el resto)

Respuesta del cliente, cargada a mano:
  → Aprobada             → descuenta inventario, orden a En reparación / Esperando repuestos
  → Aprobada parcialmente→ se editan los ítems, se regenera el PDF, se reenvía (las veces que haga falta)
  → Rechazada            → no toca inventario
```

**Ningún cambio de estado es automático**, salvo la creación inicial en `PENDING_REVIEW` al guardar un diagnóstico con repuestos — que es lo que el pedido describe en su punto 1.

**Precios de los repuestos:** un `DiagnosisPart` sin producto de inventario tiene `unitCost = 0`. Esos ítems llegan a la cotización en cero y quien revisa les pone precio; no se puede generar el PDF mientras algún ítem valga cero.

## 6. Qué NO incluye

- La API de Meta / envío automático con el archivo adjunto.
- Versionado histórico de cotizaciones: una aprobación parcial **edita la misma cotización** y regenera el PDF. Los PDFs anteriores siguen existiendo en `/uploads` y cada envío queda registrado en `Notification`, así que hay rastro, pero no hay "cotización v1 / v2" como entidad.
- Que el cliente apruebe desde un enlace. La respuesta la carga el personal, como se pidió.
- Firma digital del cliente sobre la cotización.
