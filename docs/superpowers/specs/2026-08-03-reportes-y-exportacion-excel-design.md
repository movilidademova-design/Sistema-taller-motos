# Reportes y Exportación a Excel — Diseño

**Fecha:** 2026-08-03
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## 1. Objetivo

Hoy el sistema no permite sacar ningún dato a Excel. Toda la información vive dentro de la aplicación: las listas de Órdenes, Clientes, Inventario, Pagos, etc. se ven paginadas en pantalla (20 filas por página), y las métricas agregadas solo existen como gráficos en el Dashboard. No hay forma de llevarse esos datos a una hoja de cálculo para analizarlos, cruzarlos, presentarlos a un contador o archivarlos.

Este spec cubre la exportación a Excel de **prácticamente todos los datos del sistema**, en dos niveles:

- **Micro (detalle)**: la tabla completa de cada módulo, fila por fila — cada orden, cada cliente, cada pago, cada movimiento de inventario.
- **Macro (agregado)**: reportes ya resumidos — ingresos por periodo/sucursal, valor de inventario, productos más usados, compras por proveedor.

Cada reporte es **independiente**: se genera y se descarga por separado, con sus propios filtros. No existe una "exportación masiva" que saque todo de una vez.

## 2. Decisiones confirmadas con el usuario

- **Dos puntos de entrada** en la interfaz:
  1. Un botón **"Exportar a Excel"** en cada lista existente (Órdenes, Clientes, Inventario, Pagos, etc.), que exporta exactamente lo que esté filtrado/buscado en pantalla en ese momento — pero **todas las filas que calcen con el filtro**, no solo la página visible.
  2. Una sección nueva **"Reportes"** en el menú, con los reportes agregados (macro) que no corresponden a ninguna lista existente.
- **Permisos**: solo **ADMIN** y **MANAGER**. Recepción y Técnico no exportan.
- **Alcance por sucursal**: se respeta exactamente el mismo control que ya existe hoy — un MANAGER exporta solo datos de su(s) sucursal(es); un ADMIN puede exportar todo el taller o filtrar por una sucursal específica.
- **Filtros disponibles en cada reporte** (combinables entre sí):
  - **Rango de fechas** (desde/hasta) — en todo lo que tenga fecha.
  - **Sucursal** — todas (solo ADMIN) o una específica.
  - **Estado / tipo** — según el módulo: estado de la orden, método de pago, estado de factura, estado de orden de compra.
  - Los filtros de búsqueda de texto que ya existen en cada lista se respetan también.
  - **NO** se incluyen filtros por persona (cliente/técnico/proveedor) ni por producto/categoría en esta versión.
- **Columnas**: cada reporte trae siempre **todas** sus columnas. No hay selector de columnas — quien quiera menos las oculta en Excel.
- **Sin plantillas guardadas**: los filtros se eligen en el momento de generar cada reporte. No se guardan configuraciones reutilizables.
- **Formato del archivo**: una sola hoja por reporte, con encabezados en español, fechas y moneda con formato legible. Sin hoja de totales separada.
- **Nada queda excluido**: se exporta todo, incluidos los módulos internos/técnicos (registro de auditoría, notificaciones, historial de estados de órdenes).
- **Construcción por fases**: primero lo operativo del día a día, después inventario/compras, después el resto.

## 3. Arquitectura backend

### 3.1. Módulo `common/excel` — espejo de `common/pdf`

El sistema ya tiene un precedente exacto de este patrón: `apps/api/src/common/pdf/pdf.service.ts` es un servicio inyectable, genérico y reutilizable (usa `pdfkit`, recibe una estructura de datos y devuelve un `Buffer`), expuesto vía `PdfModule` e inyectado en `InvoicesService`, que lo usa desde el endpoint `GET /invoices/:id/pdf`.

Se replica ese patrón con un módulo nuevo:

- **`apps/api/src/common/excel/excel.service.ts`** — servicio inyectable usando la librería **`exceljs`** (nueva dependencia; hoy no hay ninguna librería de Excel instalada). Expone un método genérico:

```ts
type ExcelColumn<T> = {
  header: string;              // encabezado en español, ej: "Número de orden"
  key: string;
  width?: number;
  format?: 'text' | 'date' | 'datetime' | 'currency' | 'number';
  value: (row: T) => unknown;  // cómo extraer el valor de cada fila
};

async generate<T>(options: {
  sheetName: string;
  columns: ExcelColumn<T>[];
  rows: T[];
}): Promise<Buffer>;
```

El servicio se encarga de: escribir la fila de encabezados con estilo (negrita, fondo), aplicar el formato numérico/fecha de cada columna (`dd/mm/yyyy`, `#,##0.00` para moneda), ajustar anchos, y congelar la primera fila para que los encabezados queden fijos al hacer scroll.

- **`apps/api/src/common/excel/excel.module.ts`** — exporta `ExcelService` para inyectarlo donde haga falta.

### 3.2. Endpoints de exportación

Cada módulo de negocio gana su propio endpoint `GET /<recurso>/export`, siguiendo la convención que ya usa `InvoicesController` para el PDF:

```ts
@Roles(Role.ADMIN, Role.MANAGER)
@Get('export')
async export(
  @CurrentUser('tenantId') tenantId: string,
  @CurrentBranch() branchId: string,
  @Query() query: ExportOrdersQueryDto,
  @Res() res: Response,
) {
  const buffer = await this.ordersService.exportToExcel(tenantId, branchId, query);
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="ordenes-${fecha}.xlsx"`,
  });
  res.send(buffer);
}
```

Puntos clave:

- **`Content-Disposition: attachment`** (no `inline` como el PDF de facturas) — el navegador debe descargar el archivo, no intentar mostrarlo.
- **Nombre de archivo descriptivo** con el recurso y la fecha de generación, ej: `ordenes-2026-08-03.xlsx`.
- **La ruta `export` debe declararse ANTES de `@Get(':id')`** en el controller, o NestJS interpretará `export` como un `:id`. (Precedente: `clients.controller.ts` ya declara `by-document/:documentId` antes de `:id` por la misma razón.)

### 3.3. Paginación: el export la ignora deliberadamente

Los endpoints de lista actuales usan `PaginationQueryDto` (`page`, `pageSize` con tope de 100, `search`). Los endpoints de export **reutilizan los mismos filtros pero sin paginar**: se traen todas las filas que calcen.

Cada módulo define su propio DTO de export que **extiende los filtros existentes y omite la paginación**, ej:

```ts
export class ExportOrdersQueryDto {
  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional() @IsDateString()
  from?: string;          // rango de fechas, inclusive

  @IsOptional() @IsDateString()
  to?: string;

  @IsOptional() @IsUUID('4')
  branchId?: string;      // solo lo puede usar un ADMIN; ver 3.4
}
```

**Nota de diseño — límite de filas:** un export sin paginación puede en teoría traer decenas de miles de filas y agotar memoria, ya que `exceljs` construye el libro completo en memoria antes de devolver el `Buffer`. Con el volumen real de un taller (miles de órdenes al año como mucho) esto no es un problema práctico. Aun así, para no dejar una bomba de tiempo, el `ExcelService` impone un **tope duro de 50.000 filas**: si la consulta supera ese número, responde `400` pidiendo al usuario que acote el rango de fechas, en vez de intentar generar el archivo y tumbar el proceso. Un export en streaming (`exceljs` lo soporta con `WorkbookWriter`) queda como mejora futura si alguna vez hiciera falta.

### 3.4. Alcance por sucursal en los reportes

El guard `BranchContextGuard` y el decorador `@CurrentBranch()` ya existentes validan que el usuario tenga acceso a la sucursal del header `X-Branch-Id`. Los reportes se apoyan en eso, con una regla adicional:

- Si el usuario es **MANAGER**: el reporte se filtra siempre por la sucursal activa (`@CurrentBranch()`). El parámetro `branchId` del query se **ignora** — un gerente no puede exportar datos de una sucursal que no es suya enviando el parámetro a mano. (Mismo criterio que ya se aplicó en `UsersService.create`, donde el `branchIds` del DTO se ignora cuando quien crea es un MANAGER.)
- Si el usuario es **ADMIN**: puede pasar `branchId` para filtrar por una sucursal específica, o **omitirlo** para exportar todas las sucursales juntas. Cuando exporta todas, el Excel incluye una columna **"Sucursal"** para poder distinguir el origen de cada fila.

### 3.5. Problema conocido: `Payment` e `Invoice` no tienen sucursal

Al revisar el esquema para definir las columnas, se detectó que **`Payment` e `Invoice` no tienen campo `branchId`** — solo `tenantId`. A diferencia de `Order`, `Client` y `Motorcycle`, nunca se les agregó en Sucursales Fase 1. Esto afecta directamente cómo se filtran por sucursal sus reportes:

- **`Invoice`** tiene `orderId` **obligatorio** (`@unique`), así que su sucursal se deriva sin ambigüedad de la orden: `where: { order: { branchId } }`. No hace falta cambiar el esquema.
- **`Payment`** tiene `orderId` **opcional** (`String?`, `onDelete: SetNull`). Un pago asociado a una orden se filtra igual que la factura (`where: { order: { branchId } }`), pero **un pago sin orden no tiene forma de saber a qué sucursal pertenece**. No se puede derivar del cliente, porque los clientes pasaron a ser compartidos por todo el taller (ver `2026-07-28-sucursales-fase1-design.md`, nota de diseño revertida del 2026-07-30).

**Decisión:** en esta fase **no se modifica el esquema**. El reporte de Pagos filtra por `order.branchId` cuando el pago tiene orden asociada, y los pagos **sin orden se incluyen siempre** (para cualquier sucursal), marcados con la columna "Sucursal" vacía o como "Sin sucursal". Es la opción que no pierde información: es preferible que un pago suelto aparezca de más en un reporte de sucursal a que desaparezca de todos los reportes y cuadre mal la contabilidad.

Agregar `branchId` a `Payment` (con el patrón expandir → backfill → contraer ya usado dos veces en este proyecto) es una mejora razonable pero es un cambio de esquema con migración de datos, y este spec es sobre reportes. Queda anotado como trabajo futuro.

## 4. Reportes incluidos

### 4.1. Fase 1 — Operativo

Lo que se usa a diario. Es la fase que incluye además toda la infraestructura (`ExcelService`, `ExcelModule`, el componente de botón de exportar en el frontend, y la sección "Reportes").

**El plan de implementación que sigue a este spec cubre únicamente la Fase 1.** Las Fases 2 y 3 se documentan aquí para dejar claro el alcance total acordado ("prácticamente todo"), pero cada una tendrá su propio plan cuando llegue su turno — igual que se hizo con Sucursales Fase 1. Una vez construida la infraestructura de la Fase 1, agregar cada reporte nuevo es trabajo repetitivo y de bajo riesgo.

| Reporte | Tipo | Origen | Filtros |
|---|---|---|---|
| **Órdenes** | Micro | Botón en `/orders` | Fechas (recepción), sucursal, estado, búsqueda |
| **Clientes** | Micro | Botón en `/clients` | Fechas (registro), búsqueda — *sin filtro de sucursal: los clientes son compartidos por todo el taller* |
| **Pagos** | Micro | Botón en `/payments` | Fechas, sucursal (vía orden), método de pago |
| **Facturas** | Micro | Botón en `/invoices` | Fechas (emisión), sucursal (vía orden), estado |
| **Ingresos** | **Macro** | Sección Reportes | Fechas, sucursal, agrupado por día / mes / sucursal |

**Columnas por reporte:**

- **Órdenes**: Número de orden, Sucursal, Estado, Cliente, Documento del cliente, Teléfono, Vehículo (marca + modelo), Motivo, Accesorios entregados, Recepcionista, Técnico, Clave de retiro, Fecha de recepción, Fecha estimada de entrega, Fecha de entrega, Motivo de cancelación.
- **Clientes**: Nombre, Apellido, Documento, Teléfono, Correo, Dirección, Fecha de nacimiento, Notas, Cantidad de vehículos, Cantidad de órdenes, Estado (activo/inactivo), Fecha de registro.
- **Pagos**: Número de recibo, Fecha, Cliente, Documento del cliente, Número de orden, Número de factura, Método, Monto, Referencia, Recibido por, Sucursal.
- **Facturas**: Número de factura, Fecha de emisión, Cliente, Documento, Número de orden, Sucursal, Subtotal, Impuesto, Descuento, Total, Monto pagado, Saldo pendiente, Estado, Fecha de vencimiento.
- **Ingresos (macro)**: Periodo (día o mes según agrupación), Sucursal, Cantidad de órdenes entregadas, Cantidad de facturas, Total facturado, Total cobrado, Saldo pendiente.

### 4.2. Fase 2 — Inventario y compras

| Reporte | Tipo | Origen | Filtros |
|---|---|---|---|
| **Productos / Inventario** | Micro | Botón en `/inventory` | Búsqueda |
| **Movimientos de inventario** | Micro | Botón en `/inventory` (pestaña Movimientos) | Fechas, tipo de movimiento |
| **Órdenes de compra** | Micro | Botón en `/purchases` | Fechas, estado |
| **Valor de inventario** | **Macro** | Sección Reportes | Sucursal |
| **Productos más usados** | **Macro** | Sección Reportes | Fechas, sucursal |
| **Compras por proveedor** | **Macro** | Sección Reportes | Fechas, estado |

**Nota:** "Compras por proveedor" y "Valor de inventario" **agrupan** por proveedor y por categoría respectivamente — eso es parte de la definición del reporte (una fila por proveedor / por categoría), no un filtro que el usuario elija. Los filtros disponibles siguen siendo únicamente fechas, sucursal y estado/tipo, consistente con la sección 2.

### 4.3. Fase 3 — El resto

Exportación de: Vehículos, Garantías, Citas, Usuarios, Servicios rápidos, Accesorios, Categorías, Proveedores, Registro de auditoría, Notificaciones, y los sub-detalles de una orden individual (diagnóstico con repuestos, cotización con ítems, mano de obra, checklist, historial de estados).

Para los sub-detalles de una orden, el botón de exportar vive en el detalle de la orden (`/orders/[id]`) y genera un Excel de esa orden específica.

## 5. Frontend

### 5.1. Botón de exportar reutilizable

Un componente nuevo, `apps/web/src/components/reports/export-button.tsx`, usado por todas las listas:

```tsx
<ExportButton
  endpoint="/orders/export"
  filename="ordenes"
  params={{ search, status, from, to }}
/>
```

Responsabilidades del componente:

- Llamar al endpoint con los filtros actuales, incluyendo el header `X-Branch-Id` (igual que cualquier otra llamada — `api.ts` ya lo agrega automáticamente leyendo `authStorage.getBranchId()`).
- Recibir la respuesta como **blob** y disparar la descarga en el navegador (`URL.createObjectURL` + un `<a download>` sintético). El cliente `api.ts` actual asume respuestas JSON, así que necesita un método nuevo `api.download(path, params)` que use `response.blob()` en vez de `response.json()`.
- Mostrar estado de carga ("Exportando...") y deshabilitar el botón mientras dura la generación.
- Manejar errores con el mismo `toast.error(getErrorMessage(error))` que usa el resto de la app — incluido el caso del tope de 50.000 filas, cuyo mensaje del backend le dice al usuario que acote el rango.
- **Solo se renderiza si el rol del usuario es ADMIN o MANAGER** (`useAuth()`), igual que se hizo con `AssignBranchesButton`.

### 5.2. Selector de rango de fechas

Un componente `date-range-filter.tsx` reutilizable (desde/hasta), usado tanto por los botones de exportar de las listas como por la sección Reportes. Por defecto **el último mes**. Debe permitir limpiar el rango para exportar todo el histórico.

### 5.3. Sección "Reportes"

- Nueva entrada en `apps/web/src/components/layout/nav-config.ts`: `{ href: '/reports', label: 'Reportes', icon: FileSpreadsheet, roles: ['ADMIN', 'MANAGER'] }`.
- Nueva página `apps/web/src/app/(app)/reports/page.tsx`: una tarjeta por cada reporte macro disponible, cada una con sus propios filtros y su botón de generar. Cada reporte es independiente — se configura y descarga por separado.
- En Fase 1 la página arranca con un solo reporte (Ingresos) y crece en las fases siguientes.

**Nota de diseño — por qué una sección aparte y no solo botones:** los reportes macro (ingresos, valor de inventario, productos más usados) no corresponden a ninguna lista existente de la aplicación — no hay una pantalla "Ingresos" con una tabla a la que se le pueda colgar un botón. Por eso necesitan un lugar propio. Los reportes micro, en cambio, sí tienen su lista, y ahí el botón en contexto es más natural que obligar al usuario a ir a otra sección y reconfigurar los filtros que ya tenía puestos en pantalla.

## 6. Qué NO incluye este spec

- **Exportación a PDF de reportes** — el `PdfService` existente es para facturas/cotizaciones con formato de documento, no para tablas de datos. Si más adelante hace falta un reporte imprimible, es otro trabajo.
- **Envío programado de reportes por correo** (ej: "mándame el reporte de ingresos cada lunes").
- **Gráficos dentro del Excel** — solo datos tabulares.
- **Plantillas de reporte guardadas** — descartado explícitamente por el usuario para esta versión.
- **Selector de columnas** — descartado explícitamente; todos los reportes traen todas sus columnas.
- **Agregar `branchId` a `Payment`** — ver sección 3.5; queda como trabajo futuro.
- **Exportación en streaming para volúmenes muy grandes** — ver sección 3.3; el tope de 50.000 filas cubre el caso real.
