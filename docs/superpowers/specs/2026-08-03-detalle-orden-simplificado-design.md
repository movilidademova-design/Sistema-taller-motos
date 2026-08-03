# Detalle de la Orden Simplificado — Diseño

**Fecha:** 2026-08-03
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## 1. Objetivo

Al usar el detalle de una orden en el día a día aparecieron cuatro problemas concretos:

1. **El checklist no se usa.** Son 15 ítems con calificación de condición que nadie llena; ocupan la primera pestaña y son lo primero que ve quien abre una orden.
2. **Las fotos mezclan dos cosas distintas.** Hoy hay una sola galería: las fotos que tomó recepción al recibir la moto (el registro de cómo llegó) conviven con cualquier foto que alguien suba después, y cualquiera puede agregar más al montón. El taller necesita separar el estado inicial —que es evidencia y no debería cambiar— de la evidencia del trabajo que sube el técnico.
3. **El diagnóstico pide demasiado.** Tiene nueve campos editables; el técnico solo necesita tres.
4. **El técnico ve la cotización.** No debe: los precios al cliente no son parte de su trabajo.

Además, **mano de obra** se elimina: es una pestaña que registra horas y costo por actividad, hoy sin un solo registro, y la cotización ya calcula su propio costo de mano de obra a partir de sus ítems (no lee de esta tabla).

Este spec cubre exactamente esos cambios. **No cubre el rediseño de las cotizaciones**, que el usuario definirá por separado.

## 2. Decisiones confirmadas con el usuario

- **Checklist y Mano de obra se eliminan por completo**: pestaña, componentes, endpoints, modelos de Prisma y tablas. Hoy hay 3 ítems de checklist (todos de la semilla de datos de prueba) y 0 registros de mano de obra, así que no se pierde información real.
- **Fotos de ingreso: solo lectura.** Quedan como registro fijo de cómo llegó la moto. Nadie agrega ni borra fotos de ingreso después de la recepción.
- **Evidencia del trabajo: sección nueva.** La suben y borran los roles **ADMIN, MANAGER y TECHNICIAN**. Recepción no.
- **Diagnóstico se reduce a tres campos** más los repuestos:
  - `description` — "Descripción técnica", obligatoria (sin cambio)
  - `faultFound` — "Falla encontrada", **pasa de obligatoria a opcional**
  - `testsPerformed` — "Pruebas realizadas", opcional (sin cambio)
  - Los repuestos (`DiagnosisPart`) siguen igual, incluida su integración con inventario.
  - **Se eliminan** del modelo: `batteryVoltage`, `controllerStatus`, `motorStatus`, `observations`, `estimatedTimeHours`, `estimatedCost`.
- **El técnico no ve la cotización**, ni en la interfaz ni por API.
- **La productividad por técnico del Panel** conserva solo "órdenes entregadas"; pierde horas y costo, que salían de mano de obra.
- **La pestaña por defecto pasa a ser Diagnóstico** (hoy es Checklist, que desaparece).

## 3. Fotos — separar ingreso de evidencia

### 3.1. El problema de fondo

`OrderPhoto` (`apps/api/prisma/schema.prisma`) tiene hoy: `id, orderId, category: PhotoCategory?, url, uploadedAt`. **No existe ningún campo que distinga una foto de ingreso de una subida después.** Las de ingreso las crea `OrdersService.intake()` sin categoría, y el endpoint `POST /orders/:id/photos` crea con una categoría opcional — así que una foto subida después sin categoría es indistinguible de una de ingreso.

### 3.2. El cambio

`OrderPhoto` gana un campo **requerido**:

```prisma
enum PhotoStage {
  INTAKE
  WORK
}

model OrderPhoto {
  // ...campos existentes...
  stage PhotoStage
}
```

`category` se conserva sin cambios (sigue siendo útil para clasificar la foto de ingreso: frontal, daño, número de serie, etc.).

**Migración.** Las 4 fotos que existen hoy son todas de ingreso — se verificó que su `uploadedAt` coincide exactamente con el `receivedAt` de su orden. Así que la columna se agrega con `DEFAULT 'INTAKE'` para rellenarlas y se le quita el default enseguida, de modo que a partir de ahí todo insert deba decir explícitamente qué es:

```sql
CREATE TYPE "PhotoStage" AS ENUM ('INTAKE', 'WORK');
ALTER TABLE "order_photos" ADD COLUMN "stage" "PhotoStage" NOT NULL DEFAULT 'INTAKE';
ALTER TABLE "order_photos" ALTER COLUMN "stage" DROP DEFAULT;
```

### 3.3. Comportamiento

- `OrdersService.intake()` crea sus fotos con `stage: 'INTAKE'`.
- `POST /orders/:id/photos` **siempre** crea con `stage: 'WORK'` — no acepta el valor por parámetro. Sus roles pasan de `ADMIN, MANAGER, RECEPTIONIST, TECHNICIAN` a **`ADMIN, MANAGER, TECHNICIAN`**.
- `DELETE /orders/:orderId/photos/:photoId` **rechaza con 400 si la foto es de ingreso**, y aplica los mismos roles. Es la única defensa real: sin esto, la interfaz podría ocultar el botón pero la API seguiría permitiendo borrar el registro del estado inicial.
- `GET /orders/:orderId/photos` no cambia (cualquier rol autenticado ve todas).

### 3.4. Interfaz

La pestaña "Fotos" pasa a mostrar dos bloques con título propio:

- **Fotos de ingreso** — galería de solo lectura, sin botón de subir ni de borrar para nadie. Si no hay, un texto que lo diga.
- **Evidencia del trabajo** — galería con subida y borrado, visible solo para ADMIN/MANAGER/TECHNICIAN. Para recepción, el bloque se ve pero sin controles.

## 4. Diagnóstico

Se eliminan seis columnas del modelo `Diagnosis` y sus campos del DTO y del formulario. `faultFound` pasa a `String?`.

Los campos eliminados están vacíos o casi: hay **un solo diagnóstico** en la base de datos. Aun así, la migración borra columnas con datos, así que es destructiva por definición — se documenta como tal.

`DiagnosisPart` y toda la lógica de repuestos (búsqueda en inventario, descuento de stock al agregar, reposición al quitar) queda **intacta**.

## 5. Cotización — fuera del alcance del técnico

Los decoradores de `apps/api/src/orders/quotations/quotations.controller.ts` cambian:

| Endpoint | Antes | Ahora |
|---|---|---|
| `GET /orders/:orderId/quotation` | sin `@Roles` (cualquier rol) | `ADMIN, MANAGER, RECEPTIONIST` |
| `PUT /orders/:orderId/quotation` | `ADMIN, MANAGER, TECHNICIAN, RECEPTIONIST` | `ADMIN, MANAGER, RECEPTIONIST` |
| `POST .../approve` y `.../reject` | `ADMIN, MANAGER, RECEPTIONIST` | sin cambio |

En la interfaz, la pestaña "Cotización" no se renderiza para el rol TECHNICIAN.

**Nota de diseño:** el `GET` sin `@Roles` es justamente el caso que hace peligroso confiar solo en ocultar la pestaña — `RolesGuard` deja pasar a cualquiera cuando falta el decorador (se verificó en `apps/api/src/common/guards/roles.guard.ts`), así que un técnico podría leer los precios llamando la API directamente.

## 6. Eliminaciones

### 6.1. Checklist

Se borra: `apps/api/src/orders/checklist/` completo, su registro en `orders.module.ts`, los modelos `ChecklistItem` y los enums `ChecklistItemType` / `ConditionRating` del esquema, la tabla `checklist_items`, las etiquetas en `packages/shared/src/enums.ts`, el componente `apps/web/src/components/orders/checklist-tab.tsx`, los tipos del frontend y las líneas de `seed.ts` que lo poblaban.

No hay dependencias externas: se verificó que ni cotizaciones, ni facturas, ni reportes, ni notificaciones leen el checklist.

### 6.2. Mano de obra

Se borra: `apps/api/src/orders/labor/` completo, su registro en `orders.module.ts`, el modelo `LaborEntry`, la tabla `labor_entries`, el componente `labor-tab.tsx` y sus tipos.

**Único dependiente externo:** `DashboardService.getTechnicianProductivity` agrega `hours` y `cost` de `laborEntry`. Ese método pasa a devolver solo `ordersDelivered` por técnico. (El endpoint existe pero hoy no está conectado a ninguna pantalla del Panel.)

## 7. Qué NO incluye este spec

- **El rediseño de las cotizaciones**, que el usuario definirá en una conversación aparte.
- Cualquier cambio al asistente de ingreso de vehículos (`/orders/new`), más allá de que sus fotos ahora se guardan con `stage: 'INTAKE'`.
- Cambios a la lógica de repuestos e inventario.
- Reactivar la métrica de productividad por técnico en el Panel.
