# Sucursales — Fase 1: Infraestructura + Órdenes/Clientes/Vehículos — Diseño

**Fecha:** 2026-07-28
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## 1. Objetivo

Hoy el sistema no tiene ningún concepto de sucursal/tienda — todo está organizado por `Tenant` (el negocio completo: una sola dirección, un solo contador de órdenes). Esta fase introduce el concepto de **Sucursal** como una nueva dimensión de datos dentro de cada `Tenant`, y lo aplica primero al flujo de ingreso de vehículos (Clientes, Vehículos, Órdenes) — el flujo transaccional más importante del sistema.

El resto de los módulos (Inventario, Compras, Facturas/Ventas, Pagos, Agenda, Dashboard) quedan explícitamente **fuera de esta fase** — se aplicará el mismo patrón ya probado aquí en una Fase 2 separada, una vez validado este mecanismo en producción.

El sistema de roles avanzado (Super Administrador vs. Administrador de Tienda, permisos granulares por usuario) también queda **fuera de esta fase** — se construye después, sobre esta base. Por ahora, cualquier usuario con rol `ADMIN` ve y opera en todas las sucursales automáticamente, sin necesidad de asignación explícita.

## 2. Decisiones ya confirmadas con el usuario

- **ADMIN ve todas las sucursales automáticamente** — no requiere fila de asignación en `UserBranch`. Cualquier otro rol solo ve las sucursales a las que fue asignado explícitamente.
- **Numeración de órdenes**: cada sucursal recibe un código de 4 dígitos al crearse. El número de orden pasa a ser `<código sucursal><secuencia de 4 dígitos, propia de esa sucursal>` — ej. sucursal con código `2056` → primera orden `20560001`, segunda `20560002`, etc. **Las facturas seguirán el mismo esquema** — decisión ya tomada, pero se implementa en la Fase 2 junto con el resto de la sucursalización de Facturas (ver sección 7); en esta Fase 1, `Invoice` no cambia.
- **Datos existentes**: al migrar, se crea automáticamente una sucursal "Principal" (usando el nombre/dirección actual del `Tenant`) y todos los registros existentes (órdenes, clientes, vehículos) se le asignan — nada queda huérfano.
- **Inventario** (aplicable en Fase 2, decisión ya tomada para no perderla): cada producto pertenece a una sola sucursal — si el mismo repuesto existe físicamente en dos sucursales, son dos registros de producto separados, cada uno con su propio stock. No hay catálogo compartido con stock por sucursal.
- **"Gastos"** no existe como módulo en el sistema hoy (no hay tabla de gastos) — queda fuera de alcance por completo, ni siquiera en Fase 2. Se construirá como función nueva en el futuro, con sucursal desde el día uno.
- **"Ventas"** del documento original se interpreta como el módulo de Facturas (`Invoice`) ya existente — no hay una entidad "Venta" separada en el sistema.

## 3. Modelo de datos

```prisma
model Branch {
  id                String   @id @default(uuid())
  tenantId          String
  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name              String
  code              String   // 4 dígitos, único por tenant
  address           String?
  city              String?
  phone             String?
  email             String?
  isActive          Boolean  @default(true)
  nextOrderNumber   Int      @default(1)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  userBranches UserBranch[]
  clients      Client[]
  motorcycles  Motorcycle[]
  orders       Order[]

  @@unique([tenantId, code])
  @@index([tenantId])
  @@map("branches")
}

model UserBranch {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  branchId  String
  branch    Branch   @relation(fields: [branchId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([userId, branchId])
  @@index([branchId])
  @@map("user_branches")
}
```

`Client`, `Motorcycle`, y `Order` ganan un campo `branchId String` requerido (con su relación a `Branch`), siguiendo el mismo patrón que `tenantId` ya usa en todo el esquema.

`Order.orderNumber` cambia de `Int` a `String` — pasa a almacenar el número completo ya formado (ej. `"20560001"`), calculado a partir de `branch.code` + `branch.nextOrderNumber` (con el mismo patrón de bloqueo transaccional que hoy usa `Tenant.nextOrderNumber`/`generateUniquePickupCode`, mecanizado ahora contra la fila de `Branch`). Esto es un cambio de tipo real, no solo un campo nuevo — toca:
- La generación del número de orden (`OrdersService`).
- Cualquier lugar que construya mensajes usando el número de orden (WhatsApp, notificaciones — `notification-message.util.ts`, `intake-reason.util.ts` y similares).
- Los tipos de TypeScript del frontend (`Order.orderNumber: number` → `string`).
- Cualquier búsqueda/filtro por número de orden.

## 4. Backend — resolución de "sucursal actual"

Nuevo mecanismo, análogo al ya existente `@CurrentUser()`:

- El frontend envía la sucursal seleccionada en cada llamada a la API vía un header (`X-Branch-Id`), igual que ya envía el token de autenticación.
- Un nuevo guard (`BranchContextGuard`, corriendo después de `JwtAuthGuard`) lee ese header, valida que la sucursal pertenezca al tenant del usuario, y valida que el usuario tenga acceso a ella (rol `ADMIN` → acceso automático a todas; cualquier otro rol → debe existir una fila en `UserBranch`). Si la validación falla, responde 403. Si el header falta en un endpoint que lo requiere, responde 400.
- Un nuevo decorador `@CurrentBranch()` expone el `branchId` ya validado a los controllers/services, igual que `@CurrentUser('tenantId')` hoy.
- Cada servicio afectado (`OrdersService`, `ClientsService`, `MotorcyclesService`) agrega `branchId` a sus filtros `where`, igual que ya hacen con `tenantId`.

**Nota de diseño (corregida tras la revisión final — la versión anterior de este párrafo prometía algo que el esquema no permite):** con esta decisión, un cliente con la misma cédula que ya existe en OTRA sucursal no será encontrado por la búsqueda de cédula del asistente de ingreso (que queda filtrada por sucursal). El texto original de esta nota decía que esto crearía "un registro de cliente nuevo, separado, en la sucursal actual" — pero `Client` mantiene la restricción `@@unique([tenantId, documentId])` que ya existía antes de esta fase (no es exclusiva por sucursal), así que un segundo registro con la misma cédula es literalmente imposible a nivel de base de datos. El comportamiento real implementado es: si el intento de creación choca con esa restricción, se compara la sucursal del cliente existente — si coincide con la sucursal actual (una carrera entre solicitudes concurrentes), se reutiliza; si es de OTRA sucursal, se rechaza con un 409 explicando que el cliente ya existe en otra sucursal, en vez de vincularlo silenciosamente. Esto es consistente con cómo `ClientsService.create` (usado por la página de gestión de clientes) ya manejaba el mismo conflicto. Si en el futuro se quiere de verdad un registro separado por sucursal, hace falta cambiar la restricción a `@@unique([tenantId, branchId, documentId])` — una decisión de esquema que queda fuera del alcance de esta corrección.

**Nota de diseño — alcance del control de acceso por sucursal (agregada tras la revisión final):** esta fase solo aplica `branchId` a la CREACIÓN y LISTADO de Órdenes, Clientes y Vehículos (sección 4, primer párrafo). Los endpoints que operan sobre un registro ya identificado por id — `findOne`/`update`/`remove` de Clientes y Vehículos, y todo lo de Órdenes salvo `create`/`intake`/`findAll` — siguen sin `@CurrentBranch()` y solo verifican `tenantId`, igual que antes de esta fase. Esto es una decisión deliberada, no un descuido: antes de esta fase, cualquier rol ya veía todos los datos del tenant, así que esto no afloja ni endurece nada existente. Pero significa que hoy, un usuario con `UserBranch` solo en la Sucursal A puede leer y modificar por id una orden/cliente/vehículo de la Sucursal B si conoce (o adivina) su id — los ids son enumerables porque `GET /orders`, `/clients`, `/motorcycles` sin filtro ya no aplica pero facturas/pagos/garantías (fuera de alcance, sección 7) sí exponen referencias a órdenes de cualquier sucursal. El diálogo de asignación de sucursales en Configuración → Usuarios puede sugerir un aislamiento que hoy no es completo. El sistema de permisos granulares por usuario (sección 7) es donde se espera cerrar esto — hasta entonces, esta fase asume que todos los roles dentro de un mismo tenant siguen siendo mutuamente confiables para acceso por id, exactamente como ya era el caso.

**Nota de diseño — limitación conocida de despliegue (agregada tras la revisión final):** la secuencia de 4 migraciones de esta fase (crear `Branch`/`UserBranch` → `branchId` nullable → columna temporal `orderNumberText` → `branchId` requerido + swap de `orderNumber`) asume que los datos existentes ya fueron backfilleados con `apps/api/prisma/backfill-branches.ts` ANTES de aplicar la última migración — ese backfill es un script `tsx` independiente, no parte de las migraciones, así que `prisma migrate deploy` no lo invoca automáticamente. En este entorno de desarrollo eso se hizo a mano (Task 3 del plan de implementación), pero en un despliegue nuevo contra una base de datos con datos preexistentes de una versión anterior de la app, aplicar las 4 migraciones de corrido fallaría en la última (violación de `NOT NULL`) y quedaría en un estado que requiere `prisma migrate resolve` manual. `backfill-branches.ts` además quedó deliberadamente obsoleto (referencia campos que ya no existen en el esquema final) y no puede simplemente re-ejecutarse tal cual. Este proyecto nunca ha sido desplegado fuera de este entorno de desarrollo, así que el riesgo real hoy es bajo, pero cualquier despliegue futuro contra una base de datos con datos preexistentes debe planificar este paso manual explícitamente (aplicar migraciones hasta la de `branchId` nullable, adaptar y correr un backfill equivalente, luego continuar) en vez de asumir que `migrate deploy` es suficiente.

## 5. Frontend — selector de sucursal

- Nuevo endpoint `GET /users/me/branches` devuelve las sucursales accesibles para el usuario autenticado (todas, si es ADMIN; las asignadas, si no).
- Al iniciar sesión: si el usuario tiene una sola sucursal, se selecciona automáticamente y en silencio. Si tiene varias, se usa la última seleccionada (guardada en `localStorage`) o, si no hay ninguna guardada, se pide elegir.
- Selector nuevo en la barra superior (junto al ícono de notificaciones), **visible solo si el usuario tiene más de una sucursal accesible**. Al cambiar de sucursal, se actualiza el header `X-Branch-Id` usado por el cliente de API y se refresca la vista actual.
- El asistente de ingreso de vehículos, la lista de clientes, y la lista de vehículos quedan filtrados por la sucursal seleccionada.

## 6. Backend — Configuración de sucursales

Nuevo módulo `BranchesModule` (roles `ADMIN`, mismo patrón que `TenantsModule`): CRUD de sucursales (crear, editar, activar/desactivar — sin eliminar, igual que otros catálogos de este sistema) desde una nueva sección en Configuración, incluyendo la asignación de usuarios a sucursales (gestión de filas en `UserBranch`).

## 7. Fuera de alcance de esta fase (Fase 2, spec separada)

- Inventario, Compras, Facturas, Pagos, Agenda, Warranties, y el Dashboard — ninguno gana `branchId` todavía ni se filtra por sucursal. Esto incluye la numeración de facturas con el esquema código-sucursal + secuencia (decisión ya tomada en la sección 2, pendiente de implementar aquí).
- El sistema de roles avanzado (Super Administrador, Administrador de Tienda limitado, Cajero, rol visualizador) y los permisos granulares por usuario.
- El módulo de Gastos (no existe hoy).

## 8. Testing

Sigue el patrón ya establecido: pruebas unitarias para la lógica pura de generación de número de orden (similar a `buildIntakeReason`), y verificación manual (build + smoke test en navegador) para el resto, consistente con el resto de este proyecto.
