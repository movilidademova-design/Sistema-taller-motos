# Fase 4 — Reportes, exportaciones y cierre mensual: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Sacar del POS nuevo los mismos números y los mismos archivos de Excel que saca MotoPos hoy, empezando por el cierre mensual, que es lo que ve el contador.

**Riesgo declarado desde el diseño:** el cierre mensual es **la pieza más delicada de toda la integración**. Son unas 700 líneas de generación de Excel (`motopos/app.py` 1003-1418) y la mitad de los commits recientes de MotoPos son correcciones ahí. Un reporte que sale bonito pero con una celda corrida es peor que no tenerlo, porque nadie lo nota hasta que el contador cuadra el mes.

**Antecedente:** Fases 1, 2 y 3 implementadas. La base `motopos` tiene productos, listas, ventas, ítems, pagos, separados, ítems de separado y abonos.

---

## Lo que ya existe y hay que reutilizar

El taller **ya tiene un módulo de exportación a Excel probado**, construido en una fase anterior de este proyecto:

- `apps/api/src/common/excel/excel.service.ts` → `ExcelService.generate()`, el tipo `ExcelColumn<T>` (unión discriminada que ata el tipo de `value` al `format`), `MAX_ROWS = 50_000`, `EXCEL_CONTENT_TYPE`, `excelAttachment(prefijo)`.
- `apps/api/src/common/utils/export-filters.util.ts` → `dateRangeFilter` (ancla a `WORKSHOP_UTC_OFFSET = '-05:00'`, usa `lt` del día siguiente, lanza 400 con fechas mal formadas), `resolveExportBranchId` (lista blanca: solo ADMIN acepta una sucursal pedida por parámetro), `toWorkshopLocal(date)`.
- `apps/web/src/lib/api.ts` → `downloadFile(ruta, nombrePorDefecto)`, que ya manda `Authorization` y `X-Branch-Id`, reintenta el 401 y lee el nombre del `Content-Disposition`.

**Úsalos. No construyas un segundo mecanismo de exportación.** El zona horaria ya mordió una vez en este proyecto: un reporte de julio mostraba facturas de agosto porque una parte agrupaba en UTC y la otra en UTC-5. `toWorkshopLocal` existe por eso.

---

## Alcance

### 1. Reportes en pantalla (`GET /pos/reports/summary`)

Equivalente de `/api/reportes` de `app.py` (línea 528). Por rango de fechas y sucursal: ventas del periodo, total facturado, ganancia (precio − costo), desglose por método de pago, productos más vendidos, y separados activos con su saldo.

**Las ventas anuladas no cuentan; las notas crédito sí restan.** Es la regla que decide si el número sirve o no.

### 2. Exportaciones sueltas

- `GET /pos/sales/export` — ventas del periodo, una fila por ítem
- `GET /pos/products/export` — inventario con stock y valorización
- `GET /pos/layaways/export` — separados con saldo y abonos

Todas: rango de fechas + sucursal, con `dateRangeFilter` y `resolveExportBranchId`, y el tope de `MAX_ROWS`.

### 3. El cierre mensual (`GET /pos/reports/monthly-close`)

**La pieza crítica.** Réplica de `/api/exportar/cierre` (`app.py` 1003-1418).

Fuentes de verdad, en este orden:
1. `motopos/MODELO CIERRE.xlsx` — el formato que espera el contador.
2. `motopos/04.CIERRE ABRIL BODEGA GRIS.xlsx` — un cierre real ya entregado.
3. `motopos/app.py` líneas 1003-1418 — el código que los genera.

**Método obligatorio: leer los dos `.xlsx` con `openpyxl` antes de escribir una línea de código**, y anotar hoja por hoja qué columnas hay, en qué orden, qué formatos de número y dónde van los totales. Después implementar contra esa lista, no contra la memoria.

Lo que ya se sabe de la estructura:
- **Hoja 1**: ventas del mes, con columnas por método de pago (efectivo=10, tarjeta=11, qr=12) y filas `RC` para los abonos de separados.
- **Hoja 2 `GASTOS`**: es en realidad la conciliación de efectivo. Calcula el efectivo del mes sumando pagos de ventas y abonos de separados, y aparte imprime una sección de gastos.
- Las motos exigen **número de motor y chasis** en su fila.

**Decisión ya tomada sobre los gastos:** el módulo de gastos no se portó (la tabla estaba vacía tras meses de uso). La hoja **conserva la sección `GASTOS` en blanco** para no alterar el formato que ya conoce el contador, pero no hay pantalla para registrarlos. Si algún día hacen falta, se agregan entonces.

---

## Verificación — no es opcional

Un cierre que "parece bien" no vale. Al terminar:

1. **Sembrar un mes de datos realista** en la base `motopos`: ventas en efectivo, con tarjeta y divididas; al menos una moto con motor y chasis; una venta anulada; una nota crédito; un separado con varios abonos; y un separado completado.
2. Generar el cierre de ese mes con el sistema nuevo.
3. **Abrirlo con `openpyxl` y compararlo celda por celda contra `MODELO CIERRE.xlsx`**: mismas hojas, mismos encabezados, mismas columnas, mismos formatos de número.
4. Comprobar a mano que los totales cuadran: la suma de la columna de efectivo debe dar el efectivo del mes, la venta anulada **no** debe aparecer, y la nota crédito **sí** debe restar.
5. Reportar las discrepancias que queden. **Si algo no cuadra, decirlo** — es mucho más barato que el contador lo descubra en enero.

---

## Tareas

1. **Leer los dos `.xlsx` y documentar la estructura** en un archivo de notas dentro de la tarea. Sin esto no se empieza.
2. `GET /pos/reports/summary` con sus pruebas (anuladas fuera, notas crédito restando).
3. Las tres exportaciones sueltas, reutilizando `ExcelService` y los filtros existentes.
4. El cierre mensual.
5. Pantalla `apps/web/src/app/(app)/pos/reportes/page.tsx` con selector de rango, los números en pantalla y los botones de descarga (`downloadFile`).
6. Verificación celda por celda y pruebas de humo.

---

## Notas

- **Dos clientes de Prisma**: aquí todo es `PosPrismaService`.
- **Todo endpoint del POS necesita `@PosRoles(...)`**. Los reportes y exportaciones: **solo `PosRole.ADMIN`** — un cajero no ve la ganancia ni el cierre.
- **Nunca convertir `Decimal` a `number`** para operar. Para el Excel se convierte solo al escribir la celda.
- Zona horaria: usar `toWorkshopLocal` para agrupar por día o por mes. Es el error que ya se cometió una vez.
