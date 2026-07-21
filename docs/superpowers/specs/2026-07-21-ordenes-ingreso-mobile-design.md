# Módulo de Órdenes de Ingreso (mobile-first) — Diseño

**Fecha:** 2026-07-21
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## 1. Objetivo

Rediseñar el flujo de creación de una orden de trabajo para que sea rápido de completar desde el teléfono del taller (meta: menos de 2 minutos), cubriendo: identificación del cliente por cédula, registro de vehículo, motivo de ingreso vía etiquetas administrables + texto libre, fotos de recepción, firma digital del cliente, generación de número de orden y clave de retiro, envío de la confirmación (WhatsApp/correo/portapapeles), y verificación obligatoria de la clave al momento de entregar el vehículo.

## 2. Decisiones de alcance

- **Servicios rápidos**: etiquetas de texto administrables (CRUD + reordenar), sin precio ni relación con la cotización.
- **Tipo de vehículo**: enum fijo `BICIMOTO | PATINETA | MOTO`. No es un catálogo configurable (YAGNI — si se necesita un 4º tipo, es un cambio de código simple).
- **WhatsApp**: sin integración de servidor. Se genera un link `wa.me/<telefono>?text=<mensaje>` que el asesor abre desde su propio teléfono; no requiere contratar ninguna API de pago.
- **Fotos de recepción**: álbum único por orden, sin categoría obligatoria. Esto reemplaza la selección de categoría que existía en la pestaña de fotos (`PhotoCategory` pasa de obligatoria a opcional en el schema, pero el flujo de recepción no la usa). El sistema de fotos de **diagnóstico técnico** sigue siendo un paso aparte, sin cambios funcionales más allá de que la categoría deja de ser obligatoria.
- **Nombre del taller en el mensaje**: se usa `tenant.name` (configurable en Ajustes) en vez de un nombre de empresa fijo en el código, para mantener el proyecto multi-tenant.

### Fuera de alcance (explícito)

- No se rediseña a fondo el resto de páginas del sistema (clientes, inventario, compras, etc.) a mobile-first; se mantiene el nivel de responsividad actual (Tailwind, funcional en móvil aunque no optimizado al detalle). El esfuerzo mobile-first se concentra en el asistente de creación de orden y en el flujo de retiro del vehículo.
- No se conecta una cuenta real de WhatsApp Business API.
- No se agrega bloqueo por intentos fallidos de la clave de retiro (se puede añadir después si se necesita).
- No se construye una batería de pruebas e2e nueva (el proyecto no tiene infraestructura e2e real hoy; se sigue el patrón existente de pruebas unitarias para lógica pura).

## 3. Modelo de datos (cambios en `apps/api/prisma/schema.prisma`)

```prisma
enum VehicleType {
  BICIMOTO
  PATINETA
  MOTO
}

model Motorcycle {
  // ...campos existentes sin cambios...
  vehicleType VehicleType @default(MOTO)
}

model QuickService {
  id        String   @id @default(uuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  label     String
  position  Int      @default(0)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  @@unique([tenantId, label])
  @@index([tenantId])
  @@map("quick_services")
}

model Order {
  // ...campos existentes sin cambios...
  pickupCode           String?
  pickupCodeVerifiedAt DateTime?
  signatureUrl         String?
  signedAt             DateTime?
}

model OrderPhoto {
  // ...campos existentes sin cambios...
  category PhotoCategory?   // antes era obligatorio
}
```

`Tenant` necesita la relación inversa `quickServices QuickService[]`.

**Migración / backfill**: a las órdenes existentes se les genera un `pickupCode` aleatorio de 6 dígitos; a las motos existentes se les asigna `vehicleType = MOTO` por defecto (ya cubierto por el `@default(MOTO)` de Prisma al aplicar la migración).

**Generación de `pickupCode`**: 6 dígitos numéricos generados con `crypto.randomInt(100000, 999999)`, verificando unicidad contra las órdenes del mismo tenant que no estén en estado `DELIVERED`/`CANCELLED` (reintentar en caso de colisión, extremadamente improbable pero controlado).

## 4. Backend

### 4.1 Endpoints nuevos/cambiados

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| `GET` | `/clients/by-document/:documentId` | ADMIN, MANAGER, RECEPTIONIST | Busca cliente por cédula exacta (scoped por tenant). Devuelve cliente + sus vehículos activos, o 404. |
| `GET` | `/quick-services` | cualquier autenticado | Lista etiquetas activas del tenant, ordenadas por `position`. |
| `POST` | `/quick-services` | ADMIN, MANAGER | Crea etiqueta. |
| `PATCH` | `/quick-services/:id` | ADMIN, MANAGER | Edita etiqueta. |
| `DELETE` | `/quick-services/:id` | ADMIN, MANAGER | Soft-delete (`isActive:false`). |
| `PATCH` | `/quick-services/reorder` | ADMIN, MANAGER | Recibe lista ordenada de IDs, actualiza `position` en transacción. |
| `POST` | `/orders/intake` (multipart/form-data) | ADMIN, MANAGER, RECEPTIONIST | Endpoint todo-o-nada: crea cliente (si es nuevo) + vehículo (si es nuevo) + orden + fotos + firma, en una transacción. Genera `orderNumber` y `pickupCode`. |
| `POST` | `/orders/:id/deliver` | ADMIN, MANAGER, RECEPTIONIST | Body `{ pickupCode }`. Si coincide y el estado actual es `READY_FOR_DELIVERY`, transiciona a `DELIVERED`, registra `pickupCodeVerifiedAt` y `deliveredAt`. Si no coincide: 400, sin cambios. |
| `POST` | `/orders/:id/send-intake-message` | ADMIN, MANAGER, RECEPTIONIST | Envía el mensaje de confirmación por correo, reutilizando `EmailService`. |

### 4.2 Reglas de negocio relevantes

- **`/orders/intake` es atómico**: si cualquier parte falla (validación, error de Prisma), no debe quedar cliente, vehículo, orden ni foto huérfana. Los archivos (fotos + firma) se suben a `StorageService` antes de la transacción de base de datos (igual que ya hace `photos.service.ts` hoy); si la transacción de BD falla después de subir archivos, quedan huérfanos en storage — es una limitación aceptada y consistente con cómo ya funciona el resto del sistema (no se añade lógica de compensación/rollback de storage, sería sobre-ingeniería para este alcance).
- **`reason` combinado**: el texto final guardado en `Order.reason` combina las etiquetas de servicio rápido seleccionadas (por su `label`, como snapshot de texto — no una relación referenciada, para que el histórico de la orden no cambie si luego se edita o borra la etiqueta) más la descripción libre del cliente.
- **Endurecimiento de la máquina de estados**: `DELIVERED` deja de ser un destino alcanzable desde `PATCH /orders/:id/status` (el endpoint genérico de cambio de estado). Solo se llega a `DELIVERED` a través de `POST /orders/:id/deliver` con la clave correcta. Esto cierra el hueco (ya detectado en la auditoría) de que cualquier rol autorizado podía marcar una orden como entregada sin ningún control.
- **Validación de `clientId`/`motorcycleId` cuando se reutilizan existentes**: a diferencia de lo encontrado en la auditoría para otros módulos, este endpoint nuevo sí debe validar que el `clientId`/`motorcycleId` recibido pertenezca al `tenantId` del usuario autenticado antes de usarlo (no repetir el patrón de IDOR ya identificado en otras partes del sistema).
- **`pickupCode` se genera para cualquier orden nueva, sin importar el endpoint**: la generación del código de retiro se factoriza en la lógica de creación compartida y se aplica tanto en `POST /orders/intake` como en el `POST /orders` ya existente (que se mantiene, por si algo más lo usa). Así, el flujo de entrega (`/orders/:id/deliver`) funciona igual sin importar por cuál de los dos caminos se creó la orden — no queda una ruta "legacy" que produzca órdenes sin clave de retiro.

## 5. Frontend

### 5.1 Asistente de creación de orden (`/orders/new`)

Página completa nueva (reemplaza el diálogo actual "Nueva orden" de `orders/page.tsx`), mobile-first, un paso a la vez con barra de progreso y navegación "Atrás"/"Siguiente" fija abajo:

1. **Cédula**: búsqueda vía `GET /clients/by-document/:documentId`. Si existe → tarjeta de cliente + lista de vehículos (elegir uno o "+ Vehículo nuevo"). Si no existe → alta rápida (cédula, nombre, teléfono, correo, dirección) y continúa automáticamente al paso de vehículo.
2. **Vehículo** (si es nuevo): tipo (3 tarjetas grandes), marca, modelo, color, fecha de compra, número de serie del chasis.
3. **Motivo**: chips multi-selección de servicios rápidos (`GET /quick-services`) + textarea de descripción libre.
4. **Fotos**: grilla de 6 casillas iniciales, botón "+ Agregar foto" hasta 10, cada casilla dispara `<input type="file" accept="image/*" capture="environment">` (cámara o galería), con miniatura y opción de quitar.
5. **Firma**: lienzo táctil (componente propio con eventos pointer, sin librería externa — consistente con el resto de la UI del proyecto, construida a mano sobre Radix), texto de aceptación de términos, botón de envío deshabilitado hasta que haya trazo.
6. **Confirmación**: número de orden + clave de retiro en grande, botones "Enviar por WhatsApp" (`wa.me`), "Enviar por correo" (`POST /orders/:id/send-intake-message`), "Copiar mensaje" (`navigator.clipboard.writeText`, sin llamada al backend).

### 5.2 Panel de administración de servicios rápidos

Nueva pestaña "Servicios rápidos" dentro de Configuración (junto a las pestañas ya existentes de Datos del taller / Usuarios): lista con controles de reordenar (↑↓), editar, eliminar, y botón "+ Nuevo". Visible solo para ADMIN/MANAGER.

### 5.3 Retiro del vehículo

En la página de detalle de orden, cuando el estado es `READY_FOR_DELIVERY`, aparece el botón "Entregar vehículo" que abre un diálogo pidiendo la clave de 6 dígitos y llama a `POST /orders/:id/deliver`. Error claro si la clave no coincide.

### 5.4 Otros cambios de UI

- Renombrar la etiqueta de navegación/páginas de "Bicimotos" a "Vehículos" (solo copy, sin renombrar el modelo/tabla en base de datos).
- La pestaña de fotos de diagnóstico deja de exigir categoría (el selector se vuelve opcional).

## 6. Plantilla del mensaje de confirmación

```
Hola {{firstName}}.
Hemos recibido correctamente tu vehículo en nuestro taller.
📋 Número de Orden: {{orderNumber}}
🔐 Clave de salida: {{pickupCode}}
Esta clave será necesaria para retirar tu vehículo. Por favor, consérvala y no la compartas con terceros.
Puedes utilizar el número de orden para realizar consultas sobre el estado de la reparación.
Gracias por confiar en nosotros. Será un gusto atenderte.
Equipo {{tenantName}}
```

## 7. Testing

Se sigue el patrón ya existente en el proyecto (pruebas unitarias con Jest para lógica pura, sin infraestructura e2e real):

- Generación/unicidad de `pickupCode` (por tenant, excluyendo `DELIVERED`/`CANCELLED`).
- Combinación de etiquetas de servicio rápido + texto libre en `reason`.
- Que `PATCH /orders/:id/status` rechace `DELIVERED` como destino.
- Que `POST /orders/:id/deliver` solo transicione con la clave correcta y solo desde `READY_FOR_DELIVERY`.
