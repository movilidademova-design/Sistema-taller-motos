# Gestión de Usuarios ampliada + Catálogos (Servicios rápidos / Accesorios) por Sucursal — Diseño

**Fecha:** 2026-07-29
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## 1. Objetivo

Durante las pruebas manuales de Sucursales Fase 1, surgieron dos necesidades reales al usar la pantalla de Configuración → Usuarios:

1. **Un bug bloqueante**: crear un usuario fallaba con un error de Prisma (`Unknown argument 'password'`) — ya corregido de forma independiente, fuera de este spec, porque era un defecto preexistente no relacionado con el diseño.
2. **Funcionalidad faltante**: la pantalla de Usuarios no tiene botones de editar ni desactivar (el backend ya los soporta, la interfaz nunca los expuso), y el flujo de creación de usuarios y catálogos (Servicios rápidos, Accesorios) no refleja cómo trabaja un taller con varias sucursales: el Gerente de una sede debería poder gestionar su propio personal y su propio catálogo de servicios/accesorios sin depender del Administrador para cada cambio.

Este spec cubre exactamente esas dos necesidades. No es una revisión completa del sistema de roles (eso sigue siendo una fase futura, "Roles base", ya mencionada en el spec de Sucursales Fase 1) — es una ampliación puntual y acotada: dar al rol Gerente permisos de autogestión sobre su propia sucursal en tres áreas concretas (Usuarios, Servicios rápidos, Accesorios), y cerrar el hueco de UI en Usuarios.

## 2. Decisiones confirmadas con el usuario

- **Editar usuario**: el formulario permite cambiar nombre, apellido, teléfono, rol y estado (activo/inactivo). Reactivar un usuario desactivado es simplemente volver a marcar "Activo" — no hay un botón separado de "reactivar".
- **El Gerente puede crear usuarios** con cualquier rol **excepto Administrador**. Esa restricción aplica también a editar: un Gerente no puede ascender a alguien a Administrador, ni editar/desactivar a un Administrador existente.
- **Alcance del Gerente sobre usuarios**: ve, edita y desactiva **solo** los usuarios que pertenecen a su(s) propia(s) sucursal(es) (vía `UserBranch`). No ve el personal de otras sedes. El Administrador sigue viendo y gestionando a todos, en todas las sucursales, sin restricción.
- **Sucursal al crear un usuario**:
  - Si el rol elegido es **Administrador**, no se pregunta sucursal (no aplica — el Administrador ve todas automáticamente).
  - Si el rol es distinto de Administrador y **quien crea es el Administrador**, se muestra un selector obligatorio de una o más sucursales.
  - Si **quien crea es el Gerente**, no se pregunta nada — el nuevo usuario se asigna automáticamente a la(s) misma(s) sucursal(es) del Gerente que lo crea.
  - El botón "Asignar" (ya existente desde Fase 1) sigue disponible después, para agregar el usuario a sucursales adicionales.
- **Servicios rápidos y Accesorios pasan a ser por sucursal**: cada sucursal arma y gestiona su propia lista, igual que ya pasa con Órdenes/Clientes/Vehículos. No hay catálogo compartido entre sedes.
  - **Migración de datos existentes**: todo lo que existe hoy (tenant-wide) se asigna a la sucursal "Principal". Las sucursales nuevas empiezan con la lista vacía.
  - El asistente de ingreso de vehículos (selección de servicios/accesorios al recibir una moto) queda filtrado por la sucursal actualmente seleccionada.
- **Acceso del Gerente a Configuración**: el ítem de menú "Configuración" pasa a ser visible también para el rol Gerente (hoy solo Administrador lo ve). Dentro de Configuración, el Gerente ve únicamente las pestañas **Usuarios**, **Servicios rápidos** y **Accesorios** — NO ve "General" ni "Sucursales", que siguen siendo exclusivas del Administrador (ya protegidas en el backend con `@Roles(Role.ADMIN)`, así que esto es principalmente una restricción de interfaz reforzada por una protección de backend que ya existía).

## 3. Backend — Usuarios

### 3.1. Permisos de los endpoints existentes

`apps/api/src/users/users.controller.ts` cambia sus decoradores `@Roles(...)`:

| Endpoint | Antes | Ahora |
|---|---|---|
| `GET /users` | `ADMIN, MANAGER` | sin cambio — pero el *contenido* que devuelve depende del rol (ver 3.2) |
| `POST /users` (crear) | `ADMIN` | `ADMIN, MANAGER` |
| `PATCH /users/:id` (editar) | `ADMIN` | `ADMIN, MANAGER` |
| `DELETE /users/:id` (desactivar) | `ADMIN` | `ADMIN, MANAGER` |
| `POST/GET /users/:id/branches` | `ADMIN` | sin cambio (sigue siendo solo Administrador — la asignación manual de sucursales adicionales es una operación administrativa) |

### 3.2. Alcance por sucursal en `UsersService`

`findAll`, `create`, `update`, `remove` (y el `findOne` interno que usan `update`/`remove` para verificar existencia) reciben ahora el rol y, cuando el rol es `MANAGER`, el conjunto de `branchId`s del propio Gerente (vía `findMyBranches`, ya existente), para:

- **`findAll`**: si es `MANAGER`, filtrar `where: { branches: { some: { branchId: { in: managerBranchIds } } } }` (usando la relación `User.branches` ya existente hacia `UserBranch`) — un usuario que comparte al menos una sucursal con el Gerente es visible. Si es `ADMIN`, sin filtro (como hoy).
- **`create`**: si `dto.role === 'ADMIN'` y quien crea es `MANAGER`, rechazar con `403 ForbiddenException` ("No puedes crear un usuario Administrador"). Si quien crea es `MANAGER` y el rol es válido, crear el usuario y — en la misma transacción — insertar las filas `UserBranch` correspondientes a las sucursales del Gerente (sin pedirlas en el DTO). Si quien crea es `ADMIN` y el rol no es `ADMIN`, el DTO debe traer `branchIds: string[]` (obligatorio, mínimo 1) y se insertan esas filas `UserBranch` en la misma transacción.
- **`update`**: si quien edita es `MANAGER`, verificar primero que el usuario objetivo comparte sucursal con el Gerente (si no, `404` como si no existiera — no revelar que existe en otra sede) y que ni el rol actual ni el nuevo rol del usuario objetivo sea `ADMIN` (rechazar con `403` en ambos casos).
- **`remove`**: misma verificación de alcance y de "no tocar Administradores" que `update`.

### 3.3. Nuevo DTO

`CreateUserDto` gana un campo opcional `branchIds?: string[]` (`@IsOptional() @IsArray() @IsUUID('4', { each: true })`). Es "opcional" a nivel de DTO/validación porque su obligatoriedad depende de combinaciones rol-creador que se validan en el servicio, no en el DTO:
- Ausente y rol `ADMIN` → correcto, se ignora.
- Ausente y rol distinto de `ADMIN`, creador `ADMIN` → error 400 ("Debes indicar al menos una sucursal").
- Ausente y rol distinto de `ADMIN`, creador `MANAGER` → correcto, se auto-completa con las sucursales del Gerente.
- Presente y creador `MANAGER` → se ignora lo que venga en el DTO (siempre se usan las sucursales del propio Gerente); esto evita que un Gerente asigne usuarios a sucursales que no le pertenecen enviando el campo manualmente.

## 4. Backend — Servicios rápidos y Accesorios por sucursal

Mismo patrón ya usado en Sucursales Fase 1 para `Client`/`Motorcycle`/`Order`:

### 4.1. Modelo de datos

```prisma
model QuickService {
  id        String   @id @default(uuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  branchId  String
  branch    Branch   @relation(fields: [branchId], references: [id], onDelete: Restrict)
  label     String
  position  Int      @default(0)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  @@unique([tenantId, branchId, label])
  @@index([tenantId])
  @@index([branchId])
  @@map("quick_services")
}
```

Mismo cambio, con el mismo shape, para `AccessoryOption`. `Branch` gana las relaciones inversas `quickServices QuickService[]` y `accessoryOptions AccessoryOption[]`.

### 4.2. Migración (expand → backfill → contract, igual que Fase 1)

1. Migración: agregar `branchId` **nullable** a ambas tablas.
2. Script de backfill (`apps/api/prisma/backfill-catalogs-branch.ts`, un script nuevo, standalone, ejecutado a mano una sola vez — igual que `backfill-branches.ts` en su momento): para cada tenant, buscar su sucursal "Principal" (la creada en el backfill de Fase 1 o en `registerTenant`) y asignarle todos los `QuickService`/`AccessoryOption` existentes.
3. Migración: `branchId` pasa a requerido, y `@@unique([tenantId, label])` se reemplaza por `@@unique([tenantId, branchId, label])`.

**Nota de seguridad de la migración** (aprendida de Fase 1): el backfill debe ejecutarse manualmente entre las migraciones 1 y 3, documentado igual que se documentó (y se dejó como limitación conocida) en el spec de Fase 1 — no se resuelve aquí el problema de que `prisma migrate deploy` no pausa automáticamente a mitad de la secuencia; se sigue el mismo procedimiento manual ya usado.

### 4.3. Servicios y controladores

`QuickServicesService`/`AccessoryOptionsService`: `findAll` gana `branchId` en el `where` (ya no opcional — todo listado queda scoped, como `ClientsService.findAll`). `create` recibe `branchId` (vía `@CurrentBranch()`) y lo agrega al `data`. `update`/`reorder`/`remove` (por id) permanecen sin cambio de scoping (mismo patrón de "Fase 1 solo scopea creación y listado, no acceso por id" ya documentado y aceptado para Órdenes/Clientes/Vehículos).

`OrdersService.intake` (líneas donde resuelve `dto.quickServiceIds`/`dto.accessoryOptionIds`, hoy filtradas solo por `tenantId`) gana `branchId` en esos dos `findMany`, para que el asistente de ingreso solo pueda usar servicios/accesorios de la sucursal actual.

## 5. Frontend

### 5.1. Usuarios (`apps/web/src/app/(app)/settings/page.tsx`)

- Tabla de Usuarios gana botones **Editar** y **Desactivar/Reactivar** por fila (además del ya existente "Asignar").
- `NewUserForm` gana un selector de sucursal(es), condicional:
  - Oculto si el rol elegido es Administrador.
  - Mostrado y obligatorio si el rol no es Administrador y el usuario actual (quien está creando) es Administrador.
  - Oculto si quien crea es Gerente (se asigna automáticamente en el backend).
- El selector de rol en `NewUserForm`/`EditUserForm` no ofrece la opción "Administrador" cuando quien la usa es Gerente.

### 5.2. Servicios rápidos / Accesorios (mismo archivo)

`QuickServicesSettings`/`AccessoryOptionsSettings` (ya existentes, mismo patrón que `BranchesSettings`): sus llamadas a `useApiSWR`/`api.post` para listar y crear ahora dependen de la sucursal actual — el hook `useApiSWR` debe re-consultar cuando cambia `currentBranchId` (igual que ya pasa en el resto de la app, vía el header `X-Branch-Id` que `api.ts` ya adjunta automáticamente a cada request — no se necesita lógica nueva aquí, solo confirmar que el `useApiSWR` de estas dos pantallas no cachea de forma que ignore el cambio de sucursal).

### 5.3. Navegación y pestañas de Configuración

- `apps/web/src/components/layout/nav-config.ts`: el ítem de "Configuración" cambia `roles: ['ADMIN']` → `roles: ['ADMIN', 'MANAGER']`.
- `SettingsPage` (el componente raíz en `settings/page.tsx`): las pestañas "General" y "Sucursales" (y su `TabsContent`) se ocultan cuando `user.role === 'MANAGER'` — solo se muestran "Usuarios", "Servicios rápidos", "Accesorios". El `Tabs defaultValue` cambia a `"users"` cuando el rol es Gerente (ya que "general" no estaría disponible como pestaña por defecto).

## 6. Fuera de alcance

- Cualquier otro catálogo o módulo (Inventario, Compras, Facturas, Pagos, Agenda, Garantías, Dashboard) — igual que en Fase 1, esto no toca esas áreas.
- El sistema de roles avanzado completo (Super Administrador, Cajero, rol visualizador, permisos granulares por usuario) — sigue siendo una fase futura separada.
- Eliminar (hard-delete) usuarios, servicios o accesorios — se mantiene el patrón de solo desactivar/soft-delete ya usado en todo el proyecto.

## 7. Testing

Mismo patrón ya establecido en el proyecto: verificación manual (build + smoke test) para los flujos de UI, y — dado que esta ampliación toca de nuevo `BranchContextGuard`/lógica de alcance por sucursal (que ya tuvo bugs reales en revisiones anteriores durante Fase 1) — pruebas unitarias para la lógica de alcance de `UsersService` (quién ve/crea/edita a quién según rol y sucursal), siguiendo el mismo patrón usado para `createOrReactivateClient` y `BranchContextGuard`.
