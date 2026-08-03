# Reportes y Exportación a Excel — Fase 1 — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir exportar a Excel los datos operativos del taller (Órdenes, Clientes, Pagos, Facturas) desde cada lista, más un reporte agregado de Ingresos en una sección nueva "Reportes", con filtros de fecha/sucursal/estado y respetando el control de acceso por sucursal ya existente.

**Architecture:** Un `ExcelService` genérico e inyectable en `common/excel` (mismo patrón que el `PdfService` que ya existe), consumido por cada servicio de dominio a través de un endpoint `GET /<recurso>/export` que reutiliza los filtros de la lista pero sin paginar. En el frontend, un componente `<ExportButton>` reutilizable descarga el blob y un `<DateRangeFilter>` provee el rango de fechas. Los reportes agregados viven en un módulo nuevo `reports`.

**Tech Stack:** NestJS + Prisma 7 (`apps/api`), Next.js 16 App Router (`apps/web`), `exceljs` (dependencia nueva), Jest para tests unitarios.

**Spec de referencia:** `docs/superpowers/specs/2026-08-03-reportes-y-exportacion-excel-design.md`

---

## Task 1: Backend — `ExcelService` y `ExcelModule`

**Files:**
- Modify: `apps/api/package.json` (dependencia `exceljs`)
- Create: `apps/api/src/common/excel/excel.service.ts`
- Create: `apps/api/src/common/excel/excel.service.spec.ts`
- Create: `apps/api/src/common/excel/excel.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [x] **Step 1: Instalar la dependencia**

```bash
pnpm --filter @taller/api add exceljs
```

`exceljs` incluye sus propios tipos TypeScript — no hace falta un paquete `@types/`.

- [x] **Step 2: Escribir el test que falla**

Crear `apps/api/src/common/excel/excel.service.spec.ts`. Sigue el patrón de instanciación directa que ya usa el resto del proyecto (`orders.service.reactivate-client.spec.ts`, `users.service.spec.ts`) — `ExcelService` no tiene dependencias, así que se instancia sin stubs:

```ts
import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ExcelService } from './excel.service';

describe('ExcelService', () => {
  const service = new ExcelService();

  interface Row {
    name: string;
    amount: number;
    when: Date;
  }

  const columns = [
    { header: 'Nombre', key: 'name', value: (r: Row) => r.name },
    {
      header: 'Monto',
      key: 'amount',
      format: 'currency' as const,
      value: (r: Row) => r.amount,
    },
    {
      header: 'Fecha',
      key: 'when',
      format: 'date' as const,
      value: (r: Row) => r.when,
    },
  ];

  async function readBack(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb;
  }

  it('writes a header row and one row per record', async () => {
    const rows: Row[] = [
      { name: 'Ana', amount: 1500.5, when: new Date('2026-07-15T10:00:00Z') },
      { name: 'Beto', amount: 320, when: new Date('2026-07-16T10:00:00Z') },
    ];

    const buffer = await service.generate({
      sheetName: 'Prueba',
      columns,
      rows,
    });
    const sheet = (await readBack(buffer)).getWorksheet('Prueba');

    expect(sheet).toBeDefined();
    expect(sheet!.rowCount).toBe(3); // encabezado + 2 filas
    expect(sheet!.getRow(1).getCell(1).value).toBe('Nombre');
    expect(sheet!.getRow(1).getCell(2).value).toBe('Monto');
    expect(sheet!.getRow(2).getCell(1).value).toBe('Ana');
    expect(sheet!.getRow(2).getCell(2).value).toBe(1500.5);
  });

  it('applies a currency number format so Excel shows it as money, not text', async () => {
    const buffer = await service.generate({
      sheetName: 'Prueba',
      columns,
      rows: [{ name: 'Ana', amount: 10, when: new Date() }],
    });
    const sheet = (await readBack(buffer)).getWorksheet('Prueba');

    expect(sheet!.getColumn(2).numFmt).toBe('#,##0.00');
    expect(sheet!.getColumn(3).numFmt).toBe('dd/mm/yyyy');
  });

  it('freezes the header row so it stays visible while scrolling', async () => {
    const buffer = await service.generate({
      sheetName: 'Prueba',
      columns,
      rows: [{ name: 'Ana', amount: 10, when: new Date() }],
    });
    const sheet = (await readBack(buffer)).getWorksheet('Prueba');

    expect(sheet!.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  });

  it('leaves a cell empty for null and undefined instead of printing "null"', async () => {
    // Casi toda columna de estos reportes mapea un campo opcional de Prisma
    // (deliveredAt, birthDate, documentId...) sin normalizarlo antes, así que
    // este comportamiento es del que dependen los cinco servicios que exportan.
    interface Nullable {
      name: string | null;
      amount: number | undefined;
      when: Date | null;
    }

    const buffer = await service.generate<Nullable>({
      sheetName: 'Nulos',
      columns: [
        { header: 'Nombre', key: 'name', value: (r) => r.name },
        {
          header: 'Monto',
          key: 'amount',
          format: 'currency',
          value: (r) => r.amount,
        },
        { header: 'Fecha', key: 'when', format: 'date', value: (r) => r.when },
      ],
      rows: [{ name: null, amount: undefined, when: null }],
    });
    const sheet = (await readBack(buffer)).getWorksheet('Nulos');

    expect(sheet!.getRow(2).getCell(1).value).toBeNull();
    expect(sheet!.getRow(2).getCell(2).value).toBeNull();
    expect(sheet!.getRow(2).getCell(3).value).toBeNull();
  });

  it('still produces a valid file with a header when there are no rows', async () => {
    const buffer = await service.generate({
      sheetName: 'Vacio',
      columns,
      rows: [],
    });
    const sheet = (await readBack(buffer)).getWorksheet('Vacio');

    expect(sheet!.rowCount).toBe(1);
    expect(sheet!.getRow(1).getCell(1).value).toBe('Nombre');
  });

  it('rejects exports above the row cap instead of exhausting memory', async () => {
    const rows = Array.from({ length: 50_001 }, () => ({
      name: 'x',
      amount: 1,
      when: new Date(),
    }));

    await expect(
      service.generate({ sheetName: 'Grande', columns, rows }),
    ).rejects.toThrow(BadRequestException);
  });
});
```

- [x] **Step 3: Correr el test para verificar que falla**

Run: `pnpm --filter @taller/api test -- excel.service`
Expected: FAIL — `Cannot find module './excel.service'`.

- [x] **Step 4: Implementar `ExcelService`**

Crear `apps/api/src/common/excel/excel.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export type ExcelColumnFormat =
  | 'text'
  | 'date'
  | 'datetime'
  | 'currency'
  | 'number';

interface ExcelColumnBase {
  /** Encabezado visible, en español. */
  header: string;
  key: string;
  width?: number;
}

/**
 * El tipo que devuelve `value` está atado al `format` declarado. Sin esa
 * restricción, declarar `format: 'currency'` y devolver un `Decimal` de Prisma
 * (en vez de `Number(...)`) o una cadena compila sin problema y solo se detecta
 * abriendo el archivo — y entre los reportes de esta fase hay decenas de
 * columnas de dinero y de fecha donde ese descuido es fácil.
 *
 * `null`/`undefined` se aceptan en todos los casos: la mayoría de las columnas
 * mapean campos opcionales de Prisma y exceljs los escribe como celda vacía.
 */
export type ExcelColumn<T> = ExcelColumnBase &
  (
    | { format?: 'text'; value: (row: T) => string | null | undefined }
    | {
        format: 'number' | 'currency';
        value: (row: T) => number | null | undefined;
      }
    | {
        format: 'date' | 'datetime';
        value: (row: T) => Date | null | undefined;
      }
  );

export interface GenerateOptions<T> {
  sheetName: string;
  columns: ExcelColumn<T>[];
  rows: T[];
}

/**
 * Tope de filas por reporte.
 *
 * No evita por sí solo un problema de memoria: para cuando `generate` corre, el
 * llamador ya trajo todas las filas de la base de datos. Por eso los servicios
 * que exportan una fila por registro limitan su consulta con
 * `take: MAX_ROWS + 1`, de modo que la consulta se corta temprano y este chequeo
 * convierte ese exceso en un 400 con instrucciones, en vez de intentar armar el
 * libro. Se exporta justamente para que esos servicios usen el mismo número.
 */
export const MAX_ROWS = 50_000;

const NUMBER_FORMATS: Record<ExcelColumnFormat, string | undefined> = {
  text: undefined,
  number: '#,##0',
  currency: '#,##0.00',
  date: 'dd/mm/yyyy',
  datetime: 'dd/mm/yyyy hh:mm',
};

/** Genera hojas de cálculo tabulares para los reportes exportables. */
@Injectable()
export class ExcelService {
  async generate<T>({
    sheetName,
    columns,
    rows,
  }: GenerateOptions<T>): Promise<Buffer> {
    if (rows.length > MAX_ROWS) {
      throw new BadRequestException(
        `El reporte tiene ${rows.length.toLocaleString('es-CO')} filas y el máximo es ${MAX_ROWS.toLocaleString('es-CO')}. Acota el rango de fechas e intenta de nuevo.`,
      );
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? Math.max(12, column.header.length + 4),
      style: { numFmt: NUMBER_FORMATS[column.format ?? 'text'] },
    }));

    for (const row of rows) {
      sheet.addRow(
        Object.fromEntries(
          columns.map((column) => [column.key, column.value(row)]),
        ),
      );
    }

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' },
    };
    // Deja el encabezado fijo al hacer scroll — un reporte de cientos de filas
    // es ilegible si se pierden los títulos de columna.
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
```

- [x] **Step 5: Correr el test para verificar que pasa**

Run: `pnpm --filter @taller/api test -- excel.service`
Expected: PASS — 6 tests.

- [x] **Step 6: Crear el módulo**

Crear `apps/api/src/common/excel/excel.module.ts`, copiando el patrón `@Global()` de `apps/api/src/common/pdf/pdf.module.ts` (ser global evita tener que importarlo en cada módulo de dominio que exporte datos):

```ts
import { Global, Module } from '@nestjs/common';
import { ExcelService } from './excel.service';

@Global()
@Module({
  providers: [ExcelService],
  exports: [ExcelService],
})
export class ExcelModule {}
```

- [x] **Step 7: Registrar el módulo en `app.module.ts`**

En `apps/api/src/app.module.ts`, agregar el import junto a `PdfModule` y sumarlo al array `imports` del `@Module`:

```ts
import { ExcelModule } from './common/excel/excel.module';
```

Colocar `ExcelModule` inmediatamente después de `PdfModule` en el array `imports`.

- [x] **Step 8: Verificar build y tests**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: build sin errores; todos los tests pasando (52 existentes + 6 nuevos = 58).

- [x] **Step 9: Commit**

```bash
git add apps/api/package.json apps/api/src/common/excel apps/api/src/app.module.ts pnpm-lock.yaml
git commit -m "Add generic ExcelService for tabular report exports"
```

---

## Task 2: Backend — utilidades de filtro (fechas y sucursal)

**Files:**
- Create: `apps/api/src/common/utils/export-filters.util.ts`
- Create: `apps/api/src/common/utils/export-filters.util.spec.ts`
- Create: `apps/api/src/common/dto/export-query.dto.ts`

- [x] **Step 1: Escribir el test que falla**

Crear `apps/api/src/common/utils/export-filters.util.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';
import { dateRangeFilter, resolveExportBranchId } from './export-filters.util';

describe('dateRangeFilter', () => {
  it('returns undefined when neither bound is given, so the caller omits the filter', () => {
    expect(dateRangeFilter(undefined, undefined)).toBeUndefined();
  });

  it('anchors the lower bound to local midnight, not UTC midnight', () => {
    // El taller está en UTC-5: la medianoche local del 1 de julio son las 05:00
    // UTC. Usar la medianoche UTC arrastraría cinco horas del 30 de junio.
    expect(dateRangeFilter('2026-07-01', undefined)).toEqual({
      gte: new Date('2026-07-01T05:00:00.000Z'),
    });
  });

  it('makes the upper bound inclusive of the whole local day', () => {
    // Quien pide "hasta el 31 de julio" espera todo el 31 en hora local. Un
    // `lte` a medianoche del 31 dejaría fuera el día entero, y un `lt` a
    // medianoche UTC del 1 de agosto cortaría a las 19:00 hora local del 31.
    expect(dateRangeFilter(undefined, '2026-07-31')).toEqual({
      lt: new Date('2026-08-01T05:00:00.000Z'),
    });
  });

  it('combines both bounds', () => {
    expect(dateRangeFilter('2026-07-01', '2026-07-31')).toEqual({
      gte: new Date('2026-07-01T05:00:00.000Z'),
      lt: new Date('2026-08-01T05:00:00.000Z'),
    });
  });

  it('includes a record created late on the last evening of the range', () => {
    // 20:30 hora local del 31 de julio = 01:30 UTC del 1 de agosto. Es el caso
    // exacto que se perdía anclando el límite a UTC.
    const lateSale = new Date('2026-08-01T01:30:00.000Z');
    const { lt } = dateRangeFilter('2026-07-01', '2026-07-31')!;

    expect(lateSale.getTime()).toBeLessThan(lt!.getTime());
  });

  it('rejects a malformed date instead of handing Prisma an Invalid Date', () => {
    expect(() => dateRangeFilter('ayer', undefined)).toThrow(
      BadRequestException,
    );
    expect(() => dateRangeFilter(undefined, '31-07-2026')).toThrow(
      BadRequestException,
    );
  });
});

describe('resolveExportBranchId', () => {
  const currentBranch = 'branch-actual';
  const otherBranch = 'branch-ajeno';

  it('pins a MANAGER to their active branch', () => {
    expect(resolveExportBranchId(Role.MANAGER, currentBranch, undefined)).toBe(
      currentBranch,
    );
  });

  it('ignores a branchId a MANAGER tries to request for another branch', () => {
    expect(resolveExportBranchId(Role.MANAGER, currentBranch, otherBranch)).toBe(
      currentBranch,
    );
  });

  it.each([Role.RECEPTIONIST, Role.TECHNICIAN, Role.CLIENT])(
    'pins %s to their active branch too, in case an endpoint forgets @Roles',
    (role) => {
      // RolesGuard deja pasar cualquier rol si al endpoint le falta @Roles, así
      // que estos roles nunca deben caer en la rama "ve todas las sucursales".
      expect(resolveExportBranchId(role, currentBranch, otherBranch)).toBe(
        currentBranch,
      );
      expect(resolveExportBranchId(role, currentBranch, undefined)).toBe(
        currentBranch,
      );
    },
  );

  it('lets an ADMIN narrow the export to a chosen branch', () => {
    expect(resolveExportBranchId(Role.ADMIN, currentBranch, otherBranch)).toBe(
      otherBranch,
    );
  });

  it('returns undefined for an ADMIN who asked for no branch, meaning all branches', () => {
    expect(
      resolveExportBranchId(Role.ADMIN, currentBranch, undefined),
    ).toBeUndefined();
  });
});
```

- [x] **Step 2: Correr el test para verificar que falla**

Run: `pnpm --filter @taller/api test -- export-filters`
Expected: FAIL — `Cannot find module './export-filters.util'`.

- [x] **Step 3: Implementar las utilidades**

Crear `apps/api/src/common/utils/export-filters.util.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';

/**
 * El taller opera en Colombia (UTC-5), pero Prisma guarda las fechas en UTC.
 * Interpretar "2026-07-31" como medianoche UTC dejaría fuera todo lo registrado
 * entre las 19:00 y la medianoche hora local de ese día — justo las horas de
 * cierre — y metería cinco horas del día anterior por el otro extremo. Para un
 * reporte de caja eso son cifras equivocadas, no un detalle cosmético, así que
 * los límites se anclan al día local.
 *
 * Colombia no aplica horario de verano, de modo que el desfase es constante y
 * un valor fijo alcanza. El día que la aplicación soporte talleres en otros
 * países, esto tiene que salir de la configuración del tenant (que hoy solo
 * guarda `currency`), igual que el `es-CO` que ya está fijo en `PdfService`.
 */
const WORKSHOP_UTC_OFFSET = '-05:00';

function startOfLocalDay(isoDate: string): Date {
  const date = new Date(`${isoDate}T00:00:00${WORKSHOP_UTC_OFFSET}`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(
      `Fecha inválida: "${isoDate}". Usa el formato AAAA-MM-DD.`,
    );
  }
  return date;
}

/**
 * Traduce un rango de fechas (formato YYYY-MM-DD) a un filtro de Prisma.
 * El límite superior se expresa como `lt` del día siguiente en vez de `lte` del
 * día elegido: quien pide "hasta el 31" espera incluir todo el 31, y un `lte` a
 * medianoche descartaría silenciosamente ese día completo.
 */
export function dateRangeFilter(
  from?: string,
  to?: string,
): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;

  const filter: { gte?: Date; lt?: Date } = {};
  if (from) filter.gte = startOfLocalDay(from);
  if (to) {
    const end = startOfLocalDay(to);
    // Sumar un día a una medianoche de desfase fijo da la medianoche del día
    // siguiente en ese mismo desfase, porque no hay cambio de horario que lo
    // corra.
    end.setUTCDate(end.getUTCDate() + 1);
    filter.lt = end;
  }
  return filter;
}

/**
 * Decide por qué sucursal se filtra un export.
 *
 * Solo un ADMIN puede elegir sucursal: con `branchId` acota a esa sede, sin él
 * exporta todas (y el reporte incluye la columna "Sucursal" para distinguirlas).
 * Cualquier otro rol queda anclado a la sucursal en la que está trabajando y el
 * `branchId` del query se ignora — si se respetara, bastaría con mandar el
 * parámetro a mano para leer datos de una sede ajena. Es la misma regla que ya
 * aplica `UsersService.create` al ignorar `dto.branchIds` cuando quien crea es
 * un gerente.
 *
 * Está escrito como lista blanca (solo ADMIN pasa) y no como lista negra (todos
 * menos MANAGER pasan) a propósito: `RolesGuard` deja pasar cualquier rol cuando
 * al endpoint le falta el decorador `@Roles`, así que si algún export futuro se
 * olvida de ponerlo, el peor caso es que alguien vea su propia sucursal, no que
 * un técnico se descargue los datos de todas.
 */
export function resolveExportBranchId(
  role: Role,
  currentBranchId: string,
  requestedBranchId?: string,
): string | undefined {
  if (role === Role.ADMIN) return requestedBranchId;
  return currentBranchId;
}
```

- [x] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm --filter @taller/api test -- export-filters`
Expected: PASS — 13 tests.

- [x] **Step 5: Crear el DTO base de export**

Crear `apps/api/src/common/dto/export-query.dto.ts`. Es la base que heredan los DTOs de cada módulo — deliberadamente NO extiende `PaginationQueryDto`, porque un export trae todas las filas que calcen con el filtro, no una página:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class ExportQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, description: 'Fecha inicial (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ required: false, description: 'Fecha final (YYYY-MM-DD), inclusive' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({
    required: false,
    description: 'Solo lo usa un ADMIN; en un MANAGER se ignora y se usa su sucursal activa.',
  })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;
}
```

- [x] **Step 6: Verificar build y tests**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: build limpio; 71 tests pasando (58 de antes + 13 nuevos).

- [x] **Step 7: Commit**

```bash
git add apps/api/src/common/utils/export-filters.util.ts apps/api/src/common/utils/export-filters.util.spec.ts apps/api/src/common/dto/export-query.dto.ts
git commit -m "Add date-range and branch-scoping helpers for report exports"
```

---

## Task 3: Backend — export de Órdenes

**Files:**
- Create: `apps/api/src/orders/dto/export-orders-query.dto.ts`
- Modify: `apps/api/src/orders/orders.service.ts`
- Modify: `apps/api/src/orders/orders.controller.ts`

- [x] **Step 1: Crear el DTO**

Crear `apps/api/src/orders/dto/export-orders-query.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ExportQueryDto } from '../../common/dto/export-query.dto';
import { OrderStatus } from '../../generated/prisma/enums';

export class ExportOrdersQueryDto extends ExportQueryDto {
  @ApiProperty({ required: false, enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
```

- [x] **Step 2: Agregar `exportToExcel` a `OrdersService`**

En `apps/api/src/orders/orders.service.ts`, agregar los imports que falten en la parte superior del archivo:

```ts
import { ExcelService, MAX_ROWS } from '../common/excel/excel.service';
import {
  dateRangeFilter,
  resolveExportBranchId,
} from '../common/utils/export-filters.util';
import { ExportOrdersQueryDto } from './dto/export-orders-query.dto';
import { Role } from '../generated/prisma/enums';
```

`OrderStatus` ya está importado desde `../generated/prisma/enums`; agregar `Role` a ese mismo import en vez de duplicar la línea.

Inyectar `ExcelService` en el constructor, después de `storage`:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly realtime: RealtimeGateway,
  private readonly whatsapp: WhatsappService,
  private readonly email: EmailService,
  private readonly storage: StorageService,
  private readonly excel: ExcelService,
) {}
```

**Importante:** `orders.service.reactivate-client.spec.ts` instancia `OrdersService` a mano con 5 stubs. Al agregar un sexto parámetro hay que agregar un stub más ahí, o el test rompe. Se corrige en el Step 4.

Agregar el método al final de la clase, antes del cierre:

```ts
async exportToExcel(
  tenantId: string,
  currentBranchId: string,
  role: Role,
  query: ExportOrdersQueryDto,
): Promise<Buffer> {
  const branchId = resolveExportBranchId(role, currentBranchId, query.branchId);
  const receivedAt = dateRangeFilter(query.from, query.to);

  const orders = await this.prisma.order.findMany({
    where: {
      tenantId,
      ...(branchId ? { branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(receivedAt ? { receivedAt } : {}),
      ...(query.search
        ? {
            OR: [
              { reason: { contains: query.search, mode: 'insensitive' as const } },
              { orderNumber: { contains: query.search, mode: 'insensitive' as const } },
              {
                client: {
                  firstName: { contains: query.search, mode: 'insensitive' as const },
                },
              },
              {
                client: {
                  lastName: { contains: query.search, mode: 'insensitive' as const },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { receivedAt: 'desc' },
    // Corta la consulta una fila por encima del tope para que ExcelService
    // responda un 400 con instrucciones en vez de traer medio millón de filas
    // a memoria y recién ahí darse cuenta.
    take: MAX_ROWS + 1,
    include: {
      branch: { select: { name: true } },
      client: {
        select: { firstName: true, lastName: true, documentId: true, phone: true },
      },
      motorcycle: { select: { brand: true, model: true, serialNumber: true } },
      receptionist: { select: { firstName: true, lastName: true } },
      technician: { select: { firstName: true, lastName: true } },
    },
  });

  type Row = (typeof orders)[number];
  const fullName = (p: { firstName: string; lastName: string } | null) =>
    p ? `${p.firstName} ${p.lastName}` : '';

  return this.excel.generate<Row>({
    sheetName: 'Órdenes',
    rows: orders,
    columns: [
      { header: 'Número de orden', key: 'orderNumber', value: (o) => o.orderNumber },
      { header: 'Sucursal', key: 'branch', value: (o) => o.branch.name },
      { header: 'Estado', key: 'status', value: (o) => ORDER_STATUS_LABELS[o.status] },
      { header: 'Cliente', key: 'client', width: 26, value: (o) => fullName(o.client) },
      { header: 'Documento', key: 'document', value: (o) => o.client.documentId ?? '' },
      { header: 'Teléfono', key: 'phone', value: (o) => o.client.phone ?? '' },
      {
        header: 'Vehículo',
        key: 'vehicle',
        width: 24,
        value: (o) => `${o.motorcycle.brand} ${o.motorcycle.model}`,
      },
      { header: 'Serie', key: 'serial', value: (o) => o.motorcycle.serialNumber ?? '' },
      { header: 'Motivo', key: 'reason', width: 40, value: (o) => o.reason },
      {
        header: 'Accesorios entregados',
        key: 'accessories',
        width: 30,
        value: (o) => o.accessoriesDelivered ?? '',
      },
      { header: 'Recepcionista', key: 'receptionist', width: 22, value: (o) => fullName(o.receptionist) },
      { header: 'Técnico', key: 'technician', width: 22, value: (o) => fullName(o.technician) },
      { header: 'Clave de retiro', key: 'pickupCode', value: (o) => o.pickupCode },
      {
        header: 'Fecha de recepción',
        key: 'receivedAt',
        format: 'datetime',
        value: (o) => o.receivedAt,
      },
      {
        header: 'Entrega estimada',
        key: 'estimatedDeliveryAt',
        format: 'date',
        value: (o) => o.estimatedDeliveryAt,
      },
      {
        header: 'Fecha de entrega',
        key: 'deliveredAt',
        format: 'datetime',
        value: (o) => o.deliveredAt,
      },
      {
        header: 'Motivo de cancelación',
        key: 'cancelReason',
        width: 30,
        value: (o) => o.cancelReason ?? '',
      },
    ],
  });
}
```

Declarar las etiquetas de estado en español a nivel de módulo, arriba del `@Injectable()`:

```ts
const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  RECEIVED: 'Recibida',
  DIAGNOSING: 'En diagnóstico',
  WAITING_APPROVAL: 'Esperando aprobación',
  WAITING_PARTS: 'Esperando repuestos',
  IN_REPAIR: 'En reparación',
  TESTING: 'En pruebas',
  READY_FOR_DELIVERY: 'Lista para entrega',
  DELIVERED: 'Entregada',
  CANCELLED: 'Cancelada',
  WARRANTY: 'Garantía',
};
```

**No importar esto de `@taller/shared`.** El paquete compartido define exactamente esta constante y el frontend la usa, pero `apps/api` **no declara `@taller/shared` como dependencia** (revisado: no aparece en su `package.json` ni en su `tsconfig.json`), así que ese import no compila. Duplicar la constante aquí es consistente con cómo el backend ya maneja las demás etiquetas en español (ver `PAYMENT_METHOD_LABELS` e `INVOICE_STATUS_LABELS` en las tareas 5 y 6).

- [x] **Step 3: Agregar el endpoint al controller**

En `apps/api/src/orders/orders.controller.ts`, agregar los imports:

```ts
import { StreamableFile } from '@nestjs/common';
import { ExportOrdersQueryDto } from './dto/export-orders-query.dto';
import {
  EXCEL_CONTENT_TYPE,
  excelAttachment,
} from '../common/excel/excel.service';
```

`StreamableFile` se suma a la lista de imports que ya vienen de `@nestjs/common`; no duplicar la línea.

Insertar este método **inmediatamente después de `findAll` y ANTES de `@Get(':id')`**. El orden importa: si `export` se declara después de `:id`, NestJS resuelve `/orders/export` como `findOne` con `id = "export"` y el endpoint nunca se alcanza (mismo motivo por el que `clients.controller.ts` declara `by-document/:documentId` antes de `:id`):

```ts
@Roles(Role.ADMIN, Role.MANAGER)
@Get('export')
async export(
  @CurrentUser('tenantId') tenantId: string,
  @CurrentUser('role') role: Role,
  @CurrentBranch() branchId: string,
  @Query() query: ExportOrdersQueryDto,
): Promise<StreamableFile> {
  const buffer = await this.ordersService.exportToExcel(
    tenantId,
    branchId,
    role,
    query,
  );
  return new StreamableFile(buffer, {
    type: EXCEL_CONTENT_TYPE,
    disposition: excelAttachment('ordenes'),
  });
}
```

- [x] **Step 4: Arreglar el spec existente de `OrdersService`**

`apps/api/src/orders/orders.service.reactivate-client.spec.ts` instancia el servicio con 5 argumentos. Ahora son 6. En su función `makeService`, agregar el sexto stub:

```ts
function makeService(): PrivateOrdersService {
  return new OrdersService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  ) as PrivateOrdersService;
}
```

- [x] **Step 5: Verificar build y tests**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: build limpio; 71 tests pasando (sin tests nuevos en esta tarea).

- [x] **Step 6: Probar el endpoint a mano**

Con la API corriendo:

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@tallerdemo.com","password":"Password123!"}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
curl -s -D - -o /tmp/ordenes.xlsx "http://localhost:3001/api/orders/export" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Branch-Id: 33255f8b-2ef5-49df-a5fe-3d3518180cde" | head -8
```
Expected: `HTTP/1.1 200`, `Content-Type: application/vnd.openxmlformats-...`, `Content-Disposition: attachment; filename="ordenes-....xlsx"`, y un archivo `/tmp/ordenes.xlsx` no vacío.

- [x] **Step 7: Commit**

```bash
git add apps/api/src/orders
git commit -m "Add Excel export endpoint for orders"
```

---

## Task 4: Backend — export de Clientes

**Files:**
- Modify: `apps/api/src/clients/clients.service.ts`
- Modify: `apps/api/src/clients/clients.controller.ts`

- [ ] **Step 1: Agregar `exportToExcel` a `ClientsService`**

En `apps/api/src/clients/clients.service.ts`, agregar imports:

```ts
import { ExcelService, MAX_ROWS } from '../common/excel/excel.service';
import { dateRangeFilter } from '../common/utils/export-filters.util';
import { ExportQueryDto } from '../common/dto/export-query.dto';
```

Inyectar el servicio:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly excel: ExcelService,
) {}
```

Agregar el método al final de la clase. **No recibe sucursal**: los clientes son compartidos por todo el taller desde la corrección del 2026-07-30 (ver la "Nota de diseño — revertida" en `2026-07-28-sucursales-fase1-design.md`), así que filtrar por sucursal aquí devolvería un subconjunto arbitrario según dónde se registró cada quien:

```ts
async exportToExcel(tenantId: string, query: ExportQueryDto): Promise<Buffer> {
  const createdAt = dateRangeFilter(query.from, query.to);

  const clients = await this.prisma.client.findMany({
    where: {
      tenantId,
      ...(createdAt ? { createdAt } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' as const } },
              { lastName: { contains: query.search, mode: 'insensitive' as const } },
              { documentId: { contains: query.search, mode: 'insensitive' as const } },
              { phone: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_ROWS + 1, // ver la nota en el export de Órdenes
    include: { _count: { select: { motorcycles: true, orders: true } } },
  });

  type Row = (typeof clients)[number];

  return this.excel.generate<Row>({
    sheetName: 'Clientes',
    rows: clients,
    columns: [
      { header: 'Nombre', key: 'firstName', width: 20, value: (c) => c.firstName },
      { header: 'Apellido', key: 'lastName', width: 20, value: (c) => c.lastName },
      { header: 'Documento', key: 'documentId', value: (c) => c.documentId ?? '' },
      { header: 'Teléfono', key: 'phone', value: (c) => c.phone ?? '' },
      { header: 'Correo', key: 'email', width: 28, value: (c) => c.email ?? '' },
      { header: 'Dirección', key: 'address', width: 32, value: (c) => c.address ?? '' },
      {
        header: 'Fecha de nacimiento',
        key: 'birthDate',
        format: 'date',
        value: (c) => c.birthDate,
      },
      { header: 'Notas', key: 'notes', width: 32, value: (c) => c.notes ?? '' },
      {
        header: 'Vehículos',
        key: 'motorcycles',
        format: 'number',
        value: (c) => c._count.motorcycles,
      },
      {
        header: 'Órdenes',
        key: 'orders',
        format: 'number',
        value: (c) => c._count.orders,
      },
      { header: 'Estado', key: 'isActive', value: (c) => (c.isActive ? 'Activo' : 'Inactivo') },
      {
        header: 'Fecha de registro',
        key: 'createdAt',
        format: 'datetime',
        value: (c) => c.createdAt,
      },
    ],
  });
}
```

- [ ] **Step 2: Agregar el endpoint al controller**

En `apps/api/src/clients/clients.controller.ts`, agregar imports (`StreamableFile` se suma a los de `@nestjs/common`):

```ts
import { StreamableFile } from '@nestjs/common';
import { ExportQueryDto } from '../common/dto/export-query.dto';
import {
  EXCEL_CONTENT_TYPE,
  excelAttachment,
} from '../common/excel/excel.service';
```

Insertar **antes de `@Get(':id')`** (puede ir justo después de `by-document/:documentId`):

```ts
@Roles(Role.ADMIN, Role.MANAGER)
@Get('export')
async export(
  @CurrentUser('tenantId') tenantId: string,
  @Query() query: ExportQueryDto,
): Promise<StreamableFile> {
  const buffer = await this.clientsService.exportToExcel(tenantId, query);
  return new StreamableFile(buffer, {
    type: EXCEL_CONTENT_TYPE,
    disposition: excelAttachment('clientes'),
  });
}
```

- [ ] **Step 3: Verificar build y tests**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: ambos limpios.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/clients
git commit -m "Add Excel export endpoint for clients"
```

---

## Task 5: Backend — export de Pagos

**Files:**
- Create: `apps/api/src/payments/dto/export-payments-query.dto.ts`
- Modify: `apps/api/src/payments/payments.service.ts`
- Modify: `apps/api/src/payments/payments.controller.ts`

- [ ] **Step 1: Crear el DTO**

Crear `apps/api/src/payments/dto/export-payments-query.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ExportQueryDto } from '../../common/dto/export-query.dto';
import { PaymentMethod } from '../../generated/prisma/enums';

export class ExportPaymentsQueryDto extends ExportQueryDto {
  @ApiProperty({ required: false, enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;
}
```

- [ ] **Step 2: Agregar `exportToExcel` a `PaymentsService`**

En `apps/api/src/payments/payments.service.ts`, agregar imports:

```ts
import { ExcelService, MAX_ROWS } from '../common/excel/excel.service';
import {
  dateRangeFilter,
  resolveExportBranchId,
} from '../common/utils/export-filters.util';
import { ExportPaymentsQueryDto } from './dto/export-payments-query.dto';
import { PaymentMethod, Role } from '../generated/prisma/enums';
```

`InvoiceStatus` ya se importa de `../generated/prisma/enums`; sumar `PaymentMethod` y `Role` a esa misma línea.

Inyectar el servicio:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly excel: ExcelService,
) {}
```

Agregar el método al final de la clase:

```ts
const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  QR: 'QR',
};
```

(Declarar esa constante a nivel de módulo, arriba del `@Injectable()`, no dentro de la clase.)

```ts
async exportToExcel(
  tenantId: string,
  currentBranchId: string,
  role: Role,
  query: ExportPaymentsQueryDto,
): Promise<Buffer> {
  const branchId = resolveExportBranchId(role, currentBranchId, query.branchId);
  const createdAt = dateRangeFilter(query.from, query.to);

  const payments = await this.prisma.payment.findMany({
    where: {
      tenantId,
      ...(createdAt ? { createdAt } : {}),
      ...(query.method ? { method: query.method } : {}),
      // Payment no tiene branchId propio (ver sección 3.5 del spec): la sucursal
      // se deriva de la orden. Un pago sin orden no se puede atribuir a ninguna
      // sede, así que se incluye siempre — es preferible que aparezca de más en
      // un reporte de sucursal a que desaparezca de todos y descuadre la caja.
      ...(branchId
        ? { OR: [{ order: { branchId } }, { orderId: null }] }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_ROWS + 1, // ver la nota en el export de Órdenes
    include: {
      client: { select: { firstName: true, lastName: true, documentId: true } },
      order: {
        select: { orderNumber: true, branch: { select: { name: true } } },
      },
      invoice: { select: { invoiceNumber: true } },
      receivedBy: { select: { firstName: true, lastName: true } },
    },
  });

  type Row = (typeof payments)[number];

  return this.excel.generate<Row>({
    sheetName: 'Pagos',
    rows: payments,
    columns: [
      { header: 'Número de recibo', key: 'receiptNumber', value: (p) => p.receiptNumber },
      { header: 'Fecha', key: 'createdAt', format: 'datetime', value: (p) => p.createdAt },
      {
        header: 'Cliente',
        key: 'client',
        width: 26,
        value: (p) => `${p.client.firstName} ${p.client.lastName}`,
      },
      { header: 'Documento', key: 'document', value: (p) => p.client.documentId ?? '' },
      { header: 'Número de orden', key: 'order', value: (p) => p.order?.orderNumber ?? '' },
      { header: 'Número de factura', key: 'invoice', value: (p) => p.invoice?.invoiceNumber ?? '' },
      { header: 'Método', key: 'method', value: (p) => PAYMENT_METHOD_LABELS[p.method] },
      { header: 'Monto', key: 'amount', format: 'currency', value: (p) => Number(p.amount) },
      { header: 'Referencia', key: 'reference', value: (p) => p.reference ?? '' },
      {
        header: 'Recibido por',
        key: 'receivedBy',
        width: 22,
        value: (p) => `${p.receivedBy.firstName} ${p.receivedBy.lastName}`,
      },
      {
        header: 'Sucursal',
        key: 'branch',
        value: (p) => p.order?.branch.name ?? 'Sin sucursal',
      },
    ],
  });
}
```

- [ ] **Step 3: Agregar el endpoint al controller**

En `apps/api/src/payments/payments.controller.ts`, agregar imports:

```ts
import { StreamableFile } from '@nestjs/common';
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
import { ExportPaymentsQueryDto } from './dto/export-payments-query.dto';
import {
  EXCEL_CONTENT_TYPE,
  excelAttachment,
} from '../common/excel/excel.service';
```

`PaymentsController` no tiene rutas `:id`, así que la posición no es crítica, pero por consistencia se declara después de `findAll`:

```ts
@Roles(Role.ADMIN, Role.MANAGER)
@Get('export')
async export(
  @CurrentUser('tenantId') tenantId: string,
  @CurrentUser('role') role: Role,
  @CurrentBranch() branchId: string,
  @Query() query: ExportPaymentsQueryDto,
): Promise<StreamableFile> {
  const buffer = await this.paymentsService.exportToExcel(
    tenantId,
    branchId,
    role,
    query,
  );
  return new StreamableFile(buffer, {
    type: EXCEL_CONTENT_TYPE,
    disposition: excelAttachment('pagos'),
  });
}
```

- [ ] **Step 4: Verificar build y tests**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: ambos limpios.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments
git commit -m "Add Excel export endpoint for payments"
```

---

## Task 6: Backend — export de Facturas

**Files:**
- Create: `apps/api/src/invoices/dto/export-invoices-query.dto.ts`
- Modify: `apps/api/src/invoices/invoices.service.ts`
- Modify: `apps/api/src/invoices/invoices.controller.ts`

- [ ] **Step 1: Crear el DTO**

Crear `apps/api/src/invoices/dto/export-invoices-query.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ExportQueryDto } from '../../common/dto/export-query.dto';
import { InvoiceStatus } from '../../generated/prisma/enums';

export class ExportInvoicesQueryDto extends ExportQueryDto {
  @ApiProperty({ required: false, enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;
}
```

- [ ] **Step 2: Agregar `exportToExcel` a `InvoicesService`**

En `apps/api/src/invoices/invoices.service.ts`, agregar imports:

```ts
import { ExcelService, MAX_ROWS } from '../common/excel/excel.service';
import {
  dateRangeFilter,
  resolveExportBranchId,
} from '../common/utils/export-filters.util';
import { ExportInvoicesQueryDto } from './dto/export-invoices-query.dto';
import { Role } from '../generated/prisma/enums';
```

`InvoiceStatus` y `QuotationStatus` ya vienen de `../generated/prisma/enums`; sumar `Role` a esa línea.

Inyectar `ExcelService` al final del constructor existente:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly pdfService: PdfService,
  private readonly emailService: EmailService,
  private readonly excel: ExcelService,
) {}
```

Declarar las etiquetas a nivel de módulo, arriba del `@Injectable()`:

```ts
const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Borrador',
  ISSUED: 'Emitida',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagada',
  CANCELLED: 'Anulada',
};
```

Agregar el método al final de la clase. A diferencia de `Payment`, `Invoice.orderId` es obligatorio, así que su sucursal siempre se resuelve sin ambigüedad:

```ts
async exportToExcel(
  tenantId: string,
  currentBranchId: string,
  role: Role,
  query: ExportInvoicesQueryDto,
): Promise<Buffer> {
  const branchId = resolveExportBranchId(role, currentBranchId, query.branchId);
  const issuedAt = dateRangeFilter(query.from, query.to);

  const invoices = await this.prisma.invoice.findMany({
    where: {
      tenantId,
      ...(issuedAt ? { issuedAt } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(branchId ? { order: { branchId } } : {}),
      ...(query.search
        ? {
            OR: [
              { invoiceNumber: { contains: query.search, mode: 'insensitive' as const } },
              {
                client: {
                  firstName: { contains: query.search, mode: 'insensitive' as const },
                },
              },
              {
                client: {
                  lastName: { contains: query.search, mode: 'insensitive' as const },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: { issuedAt: 'desc' },
    take: MAX_ROWS + 1, // ver la nota en el export de Órdenes
    include: {
      client: { select: { firstName: true, lastName: true, documentId: true } },
      order: {
        select: { orderNumber: true, branch: { select: { name: true } } },
      },
    },
  });

  type Row = (typeof invoices)[number];

  return this.excel.generate<Row>({
    sheetName: 'Facturas',
    rows: invoices,
    columns: [
      { header: 'Número de factura', key: 'invoiceNumber', value: (i) => i.invoiceNumber },
      { header: 'Fecha de emisión', key: 'issuedAt', format: 'datetime', value: (i) => i.issuedAt },
      {
        header: 'Cliente',
        key: 'client',
        width: 26,
        value: (i) => `${i.client.firstName} ${i.client.lastName}`,
      },
      { header: 'Documento', key: 'document', value: (i) => i.client.documentId ?? '' },
      { header: 'Número de orden', key: 'order', value: (i) => i.order.orderNumber },
      { header: 'Sucursal', key: 'branch', value: (i) => i.order.branch.name },
      { header: 'Subtotal', key: 'subtotal', format: 'currency', value: (i) => Number(i.subtotal) },
      { header: 'Impuesto', key: 'taxAmount', format: 'currency', value: (i) => Number(i.taxAmount) },
      { header: 'Descuento', key: 'discount', format: 'currency', value: (i) => Number(i.discount) },
      { header: 'Total', key: 'total', format: 'currency', value: (i) => Number(i.total) },
      { header: 'Pagado', key: 'amountPaid', format: 'currency', value: (i) => Number(i.amountPaid) },
      {
        header: 'Saldo pendiente',
        key: 'balance',
        format: 'currency',
        value: (i) => Number(i.total) - Number(i.amountPaid),
      },
      { header: 'Estado', key: 'status', value: (i) => INVOICE_STATUS_LABELS[i.status] },
      { header: 'Vencimiento', key: 'dueAt', format: 'date', value: (i) => i.dueAt },
    ],
  });
}
```

- [ ] **Step 3: Agregar el endpoint al controller**

En `apps/api/src/invoices/invoices.controller.ts`, agregar imports:

```ts
import { Query, StreamableFile } from '@nestjs/common';
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
import { ExportInvoicesQueryDto } from './dto/export-invoices-query.dto';
import {
  EXCEL_CONTENT_TYPE,
  excelAttachment,
} from '../common/excel/excel.service';
```

`Res` y `Response` ya están importados (los usa el endpoint de PDF, que se deja como está); `Query` y `StreamableFile` no, hay que sumarlos a los de `@nestjs/common`.

Insertar **entre `findAll` y `@Get(':id')`**:

```ts
@Roles(Role.ADMIN, Role.MANAGER)
@Get('export')
async export(
  @CurrentUser('tenantId') tenantId: string,
  @CurrentUser('role') role: Role,
  @CurrentBranch() branchId: string,
  @Query() query: ExportInvoicesQueryDto,
): Promise<StreamableFile> {
  const buffer = await this.invoicesService.exportToExcel(
    tenantId,
    branchId,
    role,
    query,
  );
  return new StreamableFile(buffer, {
    type: EXCEL_CONTENT_TYPE,
    disposition: excelAttachment('facturas'),
  });
}
```

- [ ] **Step 4: Verificar build y tests**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: ambos limpios.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/invoices
git commit -m "Add Excel export endpoint for invoices"
```

---

## Task 7: Backend — módulo `reports` y reporte macro de Ingresos

**Files:**
- Create: `apps/api/src/reports/dto/revenue-report-query.dto.ts`
- Create: `apps/api/src/reports/revenue.util.ts`
- Create: `apps/api/src/reports/revenue.util.spec.ts`
- Create: `apps/api/src/reports/reports.service.ts`
- Create: `apps/api/src/reports/reports.controller.ts`
- Create: `apps/api/src/reports/reports.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Crear el DTO**

Crear `apps/api/src/reports/dto/revenue-report-query.dto.ts`:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ExportQueryDto } from '../../common/dto/export-query.dto';

export enum RevenueGroupBy {
  DAY = 'day',
  MONTH = 'month',
}

export class RevenueReportQueryDto extends ExportQueryDto {
  @ApiProperty({ required: false, enum: RevenueGroupBy, default: RevenueGroupBy.MONTH })
  @IsOptional()
  @IsEnum(RevenueGroupBy)
  groupBy?: RevenueGroupBy;
}
```

- [ ] **Step 2: Escribir el test de la utilidad de agrupación**

Crear `apps/api/src/reports/revenue.util.spec.ts`:

```ts
import { RevenueGroupBy } from './dto/revenue-report-query.dto';
import { periodKey } from './revenue.util';

describe('periodKey', () => {
  const date = new Date('2026-07-15T18:30:00.000Z');

  it('formats a day bucket as YYYY-MM-DD', () => {
    expect(periodKey(date, RevenueGroupBy.DAY)).toBe('2026-07-15');
  });

  it('formats a month bucket as YYYY-MM', () => {
    expect(periodKey(date, RevenueGroupBy.MONTH)).toBe('2026-07');
  });

  it('pads single-digit months and days', () => {
    expect(periodKey(new Date('2026-01-05T00:00:00.000Z'), RevenueGroupBy.DAY)).toBe(
      '2026-01-05',
    );
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `pnpm --filter @taller/api test -- revenue.util`
Expected: FAIL — `Cannot find module './revenue.util'`.

- [ ] **Step 4: Implementar la utilidad**

Crear `apps/api/src/reports/revenue.util.ts`:

```ts
import { RevenueGroupBy } from './dto/revenue-report-query.dto';

/**
 * Etiqueta del periodo al que cae una fecha. Se usa como clave para agrupar
 * facturas y órdenes en el reporte de ingresos. Se calcula sobre UTC para que
 * el mismo dato produzca siempre el mismo bucket, sin importar la zona horaria
 * del servidor que genere el reporte.
 */
export function periodKey(date: Date, groupBy: RevenueGroupBy): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  if (groupBy === RevenueGroupBy.MONTH) return `${year}-${month}`;
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `pnpm --filter @taller/api test -- revenue.util`
Expected: PASS — 3 tests.

- [ ] **Step 6: Implementar `ReportsService`**

Crear `apps/api/src/reports/reports.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExcelService } from '../common/excel/excel.service';
import {
  dateRangeFilter,
  resolveExportBranchId,
} from '../common/utils/export-filters.util';
import {
  RevenueGroupBy,
  RevenueReportQueryDto,
} from './dto/revenue-report-query.dto';
import { periodKey } from './revenue.util';
import { OrderStatus, Role } from '../generated/prisma/enums';

interface RevenueRow {
  period: string;
  branchName: string;
  deliveredOrders: number;
  invoiceCount: number;
  invoiced: number;
  collected: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excel: ExcelService,
  ) {}

  async exportRevenue(
    tenantId: string,
    currentBranchId: string,
    role: Role,
    query: RevenueReportQueryDto,
  ): Promise<Buffer> {
    const branchId = resolveExportBranchId(role, currentBranchId, query.branchId);
    const groupBy = query.groupBy ?? RevenueGroupBy.MONTH;
    const range = dateRangeFilter(query.from, query.to);

    // A diferencia de los exports de detalle, aquí NO se usa `take: MAX_ROWS + 1`:
    // estas consultas alimentan una agregación, así que truncarlas devolvería
    // totales incorrectos en silencio — mucho peor que un reporte que tarda. El
    // riesgo de memoria es bajo porque el `select` trae solo cuatro campos
    // pequeños por fila, y lo que llega a ExcelService son los buckets ya
    // agregados (una fila por periodo y sucursal), no las facturas crudas.
    const [invoices, deliveredOrders] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          tenantId,
          ...(range ? { issuedAt: range } : {}),
          ...(branchId ? { order: { branchId } } : {}),
        },
        select: {
          issuedAt: true,
          total: true,
          amountPaid: true,
          order: { select: { branch: { select: { name: true } } } },
        },
      }),
      this.prisma.order.findMany({
        where: {
          tenantId,
          status: OrderStatus.DELIVERED,
          deliveredAt: range ? range : { not: null },
          ...(branchId ? { branchId } : {}),
        },
        select: { deliveredAt: true, branch: { select: { name: true } } },
      }),
    ]);

    const buckets = new Map<string, RevenueRow>();
    const bucketFor = (period: string, branchName: string): RevenueRow => {
      const key = `${period}|${branchName}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          period,
          branchName,
          deliveredOrders: 0,
          invoiceCount: 0,
          invoiced: 0,
          collected: 0,
        };
        buckets.set(key, bucket);
      }
      return bucket;
    };

    for (const invoice of invoices) {
      const bucket = bucketFor(
        periodKey(invoice.issuedAt, groupBy),
        invoice.order.branch.name,
      );
      bucket.invoiceCount += 1;
      bucket.invoiced += Number(invoice.total);
      bucket.collected += Number(invoice.amountPaid);
    }

    for (const order of deliveredOrders) {
      // deliveredAt no puede ser null aquí: el where lo exige explícitamente.
      const bucket = bucketFor(
        periodKey(order.deliveredAt!, groupBy),
        order.branch.name,
      );
      bucket.deliveredOrders += 1;
    }

    const rows = [...buckets.values()].sort(
      (a, b) =>
        a.period.localeCompare(b.period) ||
        a.branchName.localeCompare(b.branchName),
    );

    return this.excel.generate<RevenueRow>({
      sheetName: 'Ingresos',
      rows,
      columns: [
        { header: 'Periodo', key: 'period', value: (r) => r.period },
        { header: 'Sucursal', key: 'branchName', width: 22, value: (r) => r.branchName },
        {
          header: 'Órdenes entregadas',
          key: 'deliveredOrders',
          format: 'number',
          value: (r) => r.deliveredOrders,
        },
        {
          header: 'Facturas',
          key: 'invoiceCount',
          format: 'number',
          value: (r) => r.invoiceCount,
        },
        {
          header: 'Total facturado',
          key: 'invoiced',
          format: 'currency',
          value: (r) => r.invoiced,
        },
        {
          header: 'Total cobrado',
          key: 'collected',
          format: 'currency',
          value: (r) => r.collected,
        },
        {
          header: 'Saldo pendiente',
          key: 'balance',
          format: 'currency',
          value: (r) => r.invoiced - r.collected,
        },
      ],
    });
  }
}
```

- [ ] **Step 7: Implementar el controller**

Crear `apps/api/src/reports/reports.controller.ts`:

```ts
import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import {
  EXCEL_CONTENT_TYPE,
  excelAttachment,
} from '../common/excel/excel.service';
import { RevenueReportQueryDto } from './dto/revenue-report-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('reports')
@Roles(Role.ADMIN, Role.MANAGER)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('revenue/export')
  async exportRevenue(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('role') role: Role,
    @CurrentBranch() branchId: string,
    @Query() query: RevenueReportQueryDto,
  ): Promise<StreamableFile> {
    const buffer = await this.reportsService.exportRevenue(
      tenantId,
      branchId,
      role,
      query,
    );
    return new StreamableFile(buffer, {
      type: EXCEL_CONTENT_TYPE,
      disposition: excelAttachment('ingresos'),
    });
  }
}
```

- [ ] **Step 8: Crear el módulo y registrarlo**

Crear `apps/api/src/reports/reports.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
```

En `apps/api/src/app.module.ts`, importar `ReportsModule` y sumarlo al array `imports` (al final, junto a los demás módulos de dominio).

- [ ] **Step 9: Verificar build, tests y el endpoint**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: build limpio; 68 tests pasando.

Con la API corriendo:

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@tallerdemo.com","password":"Password123!"}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
curl -s -D - -o /tmp/ingresos.xlsx "http://localhost:3001/api/reports/revenue/export?groupBy=month" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Branch-Id: 33255f8b-2ef5-49df-a5fe-3d3518180cde" | head -8
```
Expected: `HTTP/1.1 200` y un `.xlsx` no vacío.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/reports apps/api/src/app.module.ts
git commit -m "Add reports module with revenue Excel report"
```

---

## Task 8: Frontend — helper de descarga autenticada

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Agregar `downloadFile` a `api.ts`**

El `fetchAuthedBlob` que ya existe **no sirve** para esto: no manda el header `X-Branch-Id` (así que el backend rechazaría el export con 400 por falta de contexto de sucursal), no reintenta tras un 401, y no lee el mensaje de error del cuerpo — justo el que explica el tope de 50.000 filas.

Agregar al final de `apps/web/src/lib/api.ts`:

```ts
/** Lee el nombre de archivo que propone el servidor en Content-Disposition. */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const match = /filename="?([^"]+)"?/.exec(header);
  return match ? match[1] : null;
}

/**
 * Descarga un archivo generado por el backend (Excel, PDF) respetando la sesión
 * y la sucursal activa, y disparando el "Guardar como" del navegador.
 *
 * No reutiliza `request()` porque ese parsea la respuesta como JSON; aquí el
 * cuerpo es binario. Sí replica su manejo de 401 y de mensajes de error.
 */
export async function downloadFile(
  path: string,
  fallbackFilename: string,
  options: { skipAuthRetry?: boolean } = {},
): Promise<void> {
  const token = authStorage.getAccessToken();
  const branchId = authStorage.getBranchId();

  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(branchId ? { 'X-Branch-Id': branchId } : {}),
    },
  });

  if (res.status === 401 && !options.skipAuthRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return downloadFile(path, fallbackFilename, { skipAuthRetry: true });
    }
    authStorage.clear();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError('Sesión expirada', 401);
  }

  if (!res.ok) {
    // El backend responde JSON en los errores aunque la ruta devuelva binario
    // en el camino feliz — de ahí sale el aviso del tope de filas.
    let message = res.statusText;
    try {
      const errBody = await res.json();
      message = Array.isArray(errBody.message)
        ? errBody.message.join(', ')
        : (errBody.message ?? message);
    } catch {
      // ignore parse errors, keep statusText
    }
    throw new ApiError(message, res.status);
  }

  const blob = await res.blob();
  const filename =
    filenameFromDisposition(res.headers.get('Content-Disposition')) ??
    fallbackFilename;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Verificar build**

```bash
pnpm --filter @taller/web build
```
Expected: cero errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "Add authenticated file-download helper to the API client"
```

---

## Task 9: Frontend — componentes `ExportButton` y `DateRangeFilter`

**Files:**
- Create: `apps/web/src/components/reports/export-button.tsx`
- Create: `apps/web/src/components/reports/date-range-filter.tsx`

- [ ] **Step 1: Crear `DateRangeFilter`**

Crear `apps/web/src/components/reports/date-range-filter.tsx`:

```tsx
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export interface DateRange {
  from: string;
  to: string;
}

/** Rango por defecto: el último mes, que es lo que se consulta habitualmente. */
export function defaultDateRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (value: DateRange) => void;
}) {
  const isEmpty = !value.from && !value.to;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="range-from">Desde</Label>
        <Input
          id="range-from"
          type="date"
          className="w-40"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="range-to">Hasta</Label>
        <Input
          id="range-to"
          type="date"
          className="w-40"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </div>
      {!isEmpty && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange({ from: '', to: '' })}
        >
          Limpiar fechas
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Crear `ExportButton`**

Crear `apps/web/src/components/reports/export-button.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { downloadFile } from '@/lib/api';
import { getErrorMessage, useAuth } from '@/components/providers/auth-provider';

export function ExportButton({
  endpoint,
  filename,
  params = {},
  label = 'Exportar a Excel',
}: {
  endpoint: string;
  /** Nombre de respaldo si el servidor no manda Content-Disposition. */
  filename: string;
  params?: Record<string, string | undefined>;
  label?: string;
}) {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = React.useState(false);

  // Exportar datos es una operación administrativa: recepción y técnicos no la ven.
  if (user?.role !== 'ADMIN' && user?.role !== 'MANAGER') return null;

  async function handleExport() {
    setIsExporting(true);
    try {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value) search.set(key, value);
      }
      const queryString = search.toString();
      await downloadFile(
        queryString ? `${endpoint}?${queryString}` : endpoint,
        `${filename}.xlsx`,
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isExporting}
    >
      <Download /> {isExporting ? 'Exportando...' : label}
    </Button>
  );
}
```

- [ ] **Step 3: Verificar build**

```bash
pnpm --filter @taller/web build
```
Expected: cero errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/reports
git commit -m "Add reusable ExportButton and DateRangeFilter components"
```

---

## Task 10: Frontend — botones de exportar en las listas

**Files:**
- Modify: `apps/web/src/app/(app)/orders/page.tsx`
- Modify: `apps/web/src/app/(app)/clients/page.tsx`
- Modify: `apps/web/src/app/(app)/payments/page.tsx`
- Modify: `apps/web/src/app/(app)/invoices/page.tsx`

- [ ] **Step 1: Órdenes**

En `apps/web/src/app/(app)/orders/page.tsx`, agregar imports:

```tsx
import { ExportButton } from '@/components/reports/export-button';
import { DateRangeFilter, defaultDateRange, type DateRange } from '@/components/reports/date-range-filter';
```

Agregar el estado del rango junto a los otros `useState` del componente:

```tsx
const [range, setRange] = React.useState<DateRange>(defaultDateRange());
```

En la fila de filtros existente (el `<div className="flex flex-wrap items-center gap-3">` que contiene el buscador y el `Select` de estado), agregar al final el `DateRangeFilter`:

```tsx
<DateRangeFilter value={range} onChange={setRange} />
```

Y en la cabecera, junto al botón "Nueva orden", envolver ambos botones:

```tsx
<div className="flex items-center gap-2">
  <ExportButton
    endpoint="/orders/export"
    filename="ordenes"
    params={{
      search,
      status: status !== 'ALL' ? status : undefined,
      from: range.from,
      to: range.to,
    }}
  />
  <Button asChild>
    <Link href="/orders/new">
      <Plus /> Nueva orden
    </Link>
  </Button>
</div>
```

**Nota:** el rango de fechas afecta solo al export, no a la lista en pantalla. Es intencional: la lista ya tiene su propia paginación y cambiar su comportamiento no es parte de este trabajo.

- [ ] **Step 2: Clientes**

En `apps/web/src/app/(app)/clients/page.tsx`, mismos imports y el mismo `useState` del rango. En la cabecera, envolver el `Dialog` de "Nuevo cliente" y el botón de exportar:

```tsx
<div className="flex items-center gap-2">
  <ExportButton
    endpoint="/clients/export"
    filename="clientes"
    params={{ search, from: range.from, to: range.to }}
  />
  <Dialog open={open} onOpenChange={setOpen}>
    {/* ...contenido existente sin cambios... */}
  </Dialog>
</div>
```

Y agregar el `<DateRangeFilter value={range} onChange={setRange} />` junto al buscador existente.

- [ ] **Step 3: Pagos**

`apps/web/src/app/(app)/payments/page.tsx` no tiene fila de filtros hoy — hay que agregarla. Añadir los mismos dos imports, y el estado dentro de `PaymentsPage`:

```tsx
const [range, setRange] = React.useState<DateRange>(defaultDateRange());
```

Reemplazar el bloque que va desde el `<div className="flex flex-wrap items-center justify-between gap-3">` de la cabecera hasta su `</div>` de cierre, por:

```tsx
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pagos</h1>
          <p className="text-sm text-muted-foreground">Historial de pagos recibidos</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton
            endpoint="/payments/export"
            filename="pagos"
            params={{ from: range.from, to: range.to }}
          />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus /> Registrar pago
              </Button>
            </DialogTrigger>
            <DialogContent>
              <NewPaymentForm
                onSuccess={() => {
                  setOpen(false);
                  mutate();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <DateRangeFilter value={range} onChange={setRange} />
      </div>
```

- [ ] **Step 4: Facturas**

`apps/web/src/app/(app)/invoices/page.tsx` tampoco tiene fila de filtros, y su cabecera es un `<div>` simple sin botones. Añadir los dos imports y el estado dentro de `InvoicesPage`:

```tsx
const [range, setRange] = React.useState<DateRange>(defaultDateRange());
```

Reemplazar el `<div>` de la cabecera (el que contiene el `<h1>Facturas</h1>` y su `<p>`) por:

```tsx
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facturas</h1>
          <p className="text-sm text-muted-foreground">Facturación generada a partir de órdenes con cotización aprobada</p>
        </div>
        <ExportButton
          endpoint="/invoices/export"
          filename="facturas"
          params={{ from: range.from, to: range.to }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <DateRangeFilter value={range} onChange={setRange} />
      </div>
```

- [ ] **Step 5: Verificar build**

```bash
pnpm --filter @taller/web build
```
Expected: cero errores.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/orders/page.tsx" "apps/web/src/app/(app)/clients/page.tsx" "apps/web/src/app/(app)/payments/page.tsx" "apps/web/src/app/(app)/invoices/page.tsx"
git commit -m "Add Excel export buttons to orders, clients, payments and invoices lists"
```

---

## Task 11: Frontend — sección "Reportes"

**Files:**
- Modify: `apps/web/src/components/layout/nav-config.ts`
- Create: `apps/web/src/app/(app)/reports/page.tsx`

- [ ] **Step 1: Agregar la entrada de menú**

En `apps/web/src/components/layout/nav-config.ts`, agregar `FileSpreadsheet` al import de `lucide-react` y esta entrada al array `NAV_ITEMS`, **justo antes de `/settings`** (Configuración va siempre al final):

```ts
{ href: '/reports', label: 'Reportes', icon: FileSpreadsheet, roles: ['ADMIN', 'MANAGER'] },
```

- [ ] **Step 2: Crear la página de reportes**

Crear `apps/web/src/app/(app)/reports/page.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExportButton } from '@/components/reports/export-button';
import {
  DateRangeFilter,
  defaultDateRange,
  type DateRange,
} from '@/components/reports/date-range-filter';

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Genera y descarga reportes en Excel. Cada reporte se configura y se
          descarga por separado.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RevenueReportCard />
      </div>
    </div>
  );
}

function RevenueReportCard() {
  const [range, setRange] = React.useState<DateRange>(defaultDateRange());
  const [groupBy, setGroupBy] = React.useState('month');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingresos</CardTitle>
        <CardDescription>
          Facturado, cobrado y saldo pendiente por periodo y sucursal.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="flex flex-col gap-1.5">
          <Label>Agrupar por</Label>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Día</SelectItem>
              <SelectItem value="month">Mes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <ExportButton
            endpoint="/reports/revenue/export"
            filename="ingresos"
            label="Generar reporte"
            params={{ from: range.from, to: range.to, groupBy }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Verificar build**

```bash
pnpm --filter @taller/web build
```
Expected: cero errores; la ruta `/reports` aparece en la lista de rutas generadas.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/layout/nav-config.ts "apps/web/src/app/(app)/reports/page.tsx"
git commit -m "Add Reports section with revenue report"
```

---

## Task 12: Verificación final

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Build y tests completos del backend**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
pnpm --filter @taller/api lint
```
Expected: build y tests limpios (68 tests). **Ojo:** `pnpm lint` corre con `--fix` y reformatea todo archivo que toca — si reformatea archivos fuera del alcance de este plan, descartarlos con `git checkout -- <archivo>` antes de commitear.

- [ ] **Step 2: Build completo del frontend**

```bash
pnpm --filter @taller/web build
```
Expected: cero errores.

- [ ] **Step 3: Prueba manual**

Con ambos servidores corriendo:

- [ ] Como **admin**, abrir `/orders` → aparece el botón "Exportar a Excel" y los campos Desde/Hasta. Exportar y abrir el archivo: encabezados en español, fechas legibles, una fila por orden, encabezado fijo al hacer scroll.
- [ ] Aplicar un filtro de estado y buscar algo; exportar de nuevo → el Excel contiene solo lo filtrado.
- [ ] Poner un rango de fechas que no incluya ninguna orden → el Excel se descarga con solo la fila de encabezados (no da error).
- [ ] Repetir en `/clients`, `/payments` e `/invoices`.
- [ ] Abrir `/reports` → generar el reporte de Ingresos agrupado por mes y por día; verificar que los totales cuadren con lo que muestra el Panel.
- [ ] Iniciar sesión como **gerente** (`gerente@tallerdemo.com`) → "Reportes" aparece en el menú; los exports traen solo datos de su sucursal.
- [ ] Iniciar sesión como **recepción** (`recepcion@tallerdemo.com`) → "Reportes" NO aparece en el menú y las listas NO muestran el botón "Exportar a Excel".
- [ ] Iniciar sesión como **técnico** (`tecnico@tallerdemo.com`) → mismo resultado que recepción.

- [ ] **Step 4: Commit final (solo si la prueba manual requirió correcciones)**

```bash
git add -A
git commit -m "Fix issues found during manual verification of Excel export"
```
