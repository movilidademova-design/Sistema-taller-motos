# Detalle de la Orden Simplificado — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplificar el detalle de la orden: eliminar Checklist y Mano de obra, separar las fotos de ingreso (solo lectura) de la evidencia del trabajo que sube el técnico, reducir el diagnóstico a tres campos, y ocultar la cotización al técnico.

**Architecture:** El cambio de fondo es en el modelo: `OrderPhoto` gana un campo `stage` (`INTAKE`/`WORK`) que hoy no existe y que es lo único que permite separar ambas galerías; `Diagnosis` pierde seis columnas; `ChecklistItem` y `LaborEntry` desaparecen con sus tablas. El resto es borrar código muerto y ajustar decoradores `@Roles`.

**Tech Stack:** NestJS + Prisma 7 + PostgreSQL (`apps/api`), Next.js 16 App Router (`apps/web`), enums compartidos en `packages/shared`, Jest.

**Spec de referencia:** `docs/superpowers/specs/2026-08-03-detalle-orden-simplificado-design.md`

**Nota sobre migraciones destructivas:** las tareas 1, 2 y 3 borran columnas y tablas con datos (3 ítems de checklist de la semilla, 1 diagnóstico, 0 registros de mano de obra). Está confirmado con el usuario. Antes de la primera migración conviene un respaldo: `docker exec sistema-taller-motos-postgres-1 pg_dump -U postgres taller_motos > respaldo-antes-de-simplificar.sql`.

---

## Task 1: Backend — separar fotos de ingreso y de trabajo

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_order_photo_stage/migration.sql` (la genera Prisma)
- Modify: `packages/shared/src/enums.ts`

- [ ] **Step 1: Agregar el enum y el campo al esquema**

En `apps/api/prisma/schema.prisma`, agregar el enum junto a `PhotoCategory`:

```prisma
enum PhotoStage {
  INTAKE
  WORK
}
```

Y en el modelo `OrderPhoto`, agregar el campo **requerido** después de `category`:

```prisma
model OrderPhoto {
  id         String         @id @default(uuid())
  orderId    String
  order      Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  category   PhotoCategory?
  stage      PhotoStage
  url        String
  uploadedAt DateTime       @default(now())

  @@index([orderId])
  @@map("order_photos")
}
```

(Conservar los índices/atributos que ya tenga el modelo; solo se agrega la línea `stage`.)

- [ ] **Step 2: Generar la migración**

```bash
cd apps/api && npx prisma migrate dev --name order_photo_stage --create-only
```

Prisma generará una migración que falla en una tabla con filas (columna requerida sin default). **Editar el `migration.sql` generado** para que quede exactamente:

```sql
-- CreateEnum
CREATE TYPE "PhotoStage" AS ENUM ('INTAKE', 'WORK');

-- AlterTable: se agrega con DEFAULT para rellenar las filas existentes —
-- las 4 fotos que hay son todas de ingreso (su uploadedAt coincide con el
-- receivedAt de su orden) — y luego se quita el default para que todo insert
-- nuevo tenga que decir explícitamente de qué tipo es.
ALTER TABLE "order_photos" ADD COLUMN "stage" "PhotoStage" NOT NULL DEFAULT 'INTAKE';
ALTER TABLE "order_photos" ALTER COLUMN "stage" DROP DEFAULT;
```

- [ ] **Step 3: Aplicar y verificar**

```bash
cd apps/api && npx prisma migrate dev && npx prisma generate
docker exec sistema-taller-motos-postgres-1 psql -U postgres -d taller_motos -c "SELECT stage, count(*) FROM order_photos GROUP BY stage;"
```
Expected: `INTAKE | 4`, y ninguna fila con `stage` nulo.

- [ ] **Step 4: Exponer el enum en el paquete compartido**

En `packages/shared/src/enums.ts`, junto a `PhotoCategory`, agregar:

```ts
export const PhotoStage = {
  INTAKE: 'INTAKE',
  WORK: 'WORK',
} as const;
export type PhotoStage = (typeof PhotoStage)[keyof typeof PhotoStage];
```

En este punto el build queda roto a propósito (`stage` es requerido y nadie lo envía todavía); los pasos siguientes lo cierran. **No commitear hasta el final de la tarea.**

- [ ] **Step 5: `intake()` marca sus fotos como de ingreso**

En `apps/api/src/orders/orders.service.ts`, dentro de `intake()`, la creación de fotos pasa de:

```ts
photos: { create: photoUrls.map((url) => ({ url })) },
```

a:

```ts
photos: {
  create: photoUrls.map((url) => ({ url, stage: PhotoStage.INTAKE })),
},
```

Agregar `PhotoStage` al import que ya trae `OrderStatus, Role` desde `../generated/prisma/enums`.

- [ ] **Step 6: `PhotosService` fuerza `WORK` y protege las de ingreso**

Reemplazar `upload` y `remove` en `apps/api/src/orders/photos/photos.service.ts`:

```ts
  async upload(
    tenantId: string,
    orderId: string,
    category: PhotoCategory | undefined,
    file: Express.Multer.File,
  ) {
    await this.ordersService.assertOrderExists(tenantId, orderId);
    const url = await this.storage.upload(
      file.buffer,
      file.originalname,
      file.mimetype,
      'orders',
    );
    // Siempre WORK: las fotos de ingreso solo las crea el asistente de recepción,
    // dentro de la misma transacción que la orden. Que este endpoint pudiera
    // elegir el tipo permitiría inventar "fotos de ingreso" días después, que es
    // justo lo que este campo existe para impedir.
    return this.prisma.orderPhoto.create({
      data: { orderId, category: category || undefined, url, stage: PhotoStage.WORK },
    });
  }

  async remove(tenantId: string, orderId: string, photoId: string) {
    await this.ordersService.assertOrderExists(tenantId, orderId);
    const photo = await this.prisma.orderPhoto.findFirst({
      where: { id: photoId, orderId },
    });
    if (!photo) throw new NotFoundException('Foto no encontrada');
    if (photo.stage === PhotoStage.INTAKE) {
      // El estado en que llegó el vehículo es evidencia frente al cliente; si se
      // pudiera borrar, la firma que respalda esa recepción quedaría sin sustento.
      throw new BadRequestException(
        'Las fotos de ingreso no se pueden eliminar: son el registro del estado en que se recibió el vehículo',
      );
    }
    return this.prisma.orderPhoto.delete({ where: { id: photoId } });
  }
```

Actualizar los imports del archivo:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PhotoCategory, PhotoStage } from '../../generated/prisma/enums';
```

**Nota:** el `findFirst` filtra por `orderId` además del `id` — sin eso, un `photoId` de otra orden del mismo tenant se borraría igual, porque `delete` solo miraba el id.

- [ ] **Step 7: `findAll` ordena por tipo y fecha**

Para que la interfaz reciba las fotos agrupadas de forma estable:

```ts
      orderBy: [{ stage: 'asc' }, { uploadedAt: 'desc' }],
```

(`INTAKE` ordena antes que `WORK` alfabéticamente, que es el orden en que se muestran.)

- [ ] **Step 8: Ajustar los roles del controller**

En `apps/api/src/orders/photos/photos.controller.ts`, en **`upload` y `remove`**, cambiar:

```ts
@Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TECHNICIAN)
```
por:
```ts
@Roles(Role.ADMIN, Role.MANAGER, Role.TECHNICIAN)
```

`findAll` no cambia (cualquier rol autenticado sigue viendo todas las fotos).

- [ ] **Step 9: Escribir el test**

Crear `apps/api/src/orders/photos/photos.service.spec.ts`, con el patrón de instanciación directa que usa el resto del proyecto (ver `apps/api/src/reports/reports.service.spec.ts`):

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PhotosService } from './photos.service';
import { PhotoStage } from '../../generated/prisma/enums';

function makeService(photo: { id: string; stage: PhotoStage } | null) {
  const del = jest.fn().mockResolvedValue({});
  const create = jest.fn().mockResolvedValue({});
  const service = new PhotosService(
    {
      orderPhoto: {
        findFirst: jest.fn().mockResolvedValue(photo),
        delete: del,
        create,
      },
    } as never,
    { upload: jest.fn().mockResolvedValue('/uploads/x.png') } as never,
    { assertOrderExists: jest.fn().mockResolvedValue({}) } as never,
  );
  return { service, del, create };
}

describe('PhotosService.remove', () => {
  it('refuses to delete an intake photo', async () => {
    const { service, del } = makeService({ id: 'p1', stage: PhotoStage.INTAKE });

    await expect(service.remove('t1', 'o1', 'p1')).rejects.toThrow(
      BadRequestException,
    );
    expect(del).not.toHaveBeenCalled();
  });

  it('deletes a work photo', async () => {
    const { service, del } = makeService({ id: 'p1', stage: PhotoStage.WORK });

    await service.remove('t1', 'o1', 'p1');
    expect(del).toHaveBeenCalledWith({ where: { id: 'p1' } });
  });

  it('404s when the photo does not belong to the order', async () => {
    const { service, del } = makeService(null);

    await expect(service.remove('t1', 'o1', 'p1')).rejects.toThrow(
      NotFoundException,
    );
    expect(del).not.toHaveBeenCalled();
  });
});

describe('PhotosService.upload', () => {
  it('always stores uploads as work evidence, never as intake', async () => {
    const { service, create } = makeService(null);

    await service.upload('t1', 'o1', undefined, {
      buffer: Buffer.from(''),
      originalname: 'x.png',
      mimetype: 'image/png',
    } as Express.Multer.File);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: PhotoStage.WORK }),
      }),
    );
  });
});
```

- [ ] **Step 10: Verificar**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: build limpio y todos los tests pasando, 4 nuevos.

- [ ] **Step 11: Commit**

Un solo commit con el esquema y el código que lo usa, para no dejar el build roto en la historia:

```bash
git add apps/api packages/shared
git commit -m "Tell intake photos apart from work evidence and lock the intake ones"
```

---

## Task 2: Backend — reducir el diagnóstico a tres campos

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: migración
- Modify: `apps/api/src/orders/diagnosis/dto/upsert-diagnosis.dto.ts`
- Modify: `apps/api/src/orders/diagnosis/diagnosis.service.ts`

- [ ] **Step 1: Recortar el modelo**

En `apps/api/prisma/schema.prisma`, el modelo `Diagnosis` queda:

```prisma
model Diagnosis {
  id             String          @id @default(uuid())
  orderId        String          @unique
  order          Order           @relation(fields: [orderId], references: [id], onDelete: Cascade)
  technicianId   String
  technician     User            @relation(fields: [technicianId], references: [id], onDelete: Restrict)
  description    String
  faultFound     String?
  testsPerformed String?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  requiredParts DiagnosisPart[]

  @@map("diagnoses")
}
```

Es decir: se eliminan `batteryVoltage`, `controllerStatus`, `motorStatus`, `observations`, `estimatedTimeHours`, `estimatedCost`; y `faultFound` pasa de `String` a `String?`.

- [ ] **Step 2: Generar y aplicar la migración**

```bash
cd apps/api && npx prisma migrate dev --name diagnosis_only_three_fields
```

Prisma advertirá que se pierden columnas con datos. **Es esperado y está aprobado** (hay un solo diagnóstico). Revisar el SQL generado: debe contener los `DROP COLUMN` de las seis columnas y un `ALTER COLUMN "faultFound" DROP NOT NULL`.

```bash
npx prisma generate
docker exec sistema-taller-motos-postgres-1 psql -U postgres -d taller_motos -c "\d diagnoses"
```
Expected: la tabla queda con `id, orderId, technicianId, description, faultFound (nullable), testsPerformed, createdAt, updatedAt`.

- [ ] **Step 3: Recortar el DTO**

`apps/api/src/orders/diagnosis/dto/upsert-diagnosis.dto.ts` queda completo así:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpsertDiagnosisDto {
  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  faultFound?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  testsPerformed?: string;
}
```

Como el `ValidationPipe` global corre con `forbidNonWhitelisted: true` (ver `apps/api/src/main.ts`), quitar los campos del DTO hace que mandarlos devuelva 400 en vez de ignorarlos en silencio — que es lo que se quiere.

- [ ] **Step 4: Ajustar `addPart`**

En `apps/api/src/orders/diagnosis/diagnosis.service.ts`, dentro de `addPart`, la creación del diagnóstico vacío ya no necesita `faultFound`:

```ts
        diagnosis = await tx.diagnosis.create({
          data: { orderId, technicianId, description: '' },
        });
```

- [ ] **Step 5: Verificar**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: ambos limpios.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma apps/api/src/orders/diagnosis
git commit -m "Cut diagnosis down to the three fields technicians fill in"
```

---

## Task 3: Backend — eliminar Checklist y Mano de obra

**Files:**
- Delete: `apps/api/src/orders/checklist/` (directorio completo)
- Delete: `apps/api/src/orders/labor/` (directorio completo)
- Modify: `apps/api/src/orders/orders.module.ts`
- Modify: `apps/api/src/orders/orders.service.ts`
- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `packages/shared/src/enums.ts`
- Create: migración

- [ ] **Step 1: Borrar los módulos**

```bash
rm -rf apps/api/src/orders/checklist apps/api/src/orders/labor
```

- [ ] **Step 2: Desregistrarlos**

En `apps/api/src/orders/orders.module.ts`, quitar los imports de `ChecklistController`/`ChecklistService` y `LaborController`/`LaborService`, y sus entradas de los arrays `controllers` y `providers`.

- [ ] **Step 3: Quitarlos de `ORDER_DETAIL_INCLUDE`**

En `apps/api/src/orders/orders.service.ts`, en la constante `ORDER_DETAIL_INCLUDE`, eliminar las líneas `checklistItems: true,` y `laborEntries: { orderBy: { startTime: 'desc' as const } },`.

- [ ] **Step 4: Ajustar la productividad por técnico**

En `apps/api/src/dashboard/dashboard.service.ts`, `getTechnicianProductivity` queda:

```ts
  async getTechnicianProductivity(tenantId: string) {
    const technicians = await this.prisma.user.findMany({
      where: { tenantId, role: 'TECHNICIAN' },
      select: { id: true, firstName: true, lastName: true },
    });

    // Solo órdenes entregadas: las horas y el costo salían de la tabla de mano de
    // obra, que se eliminó porque nadie la llenaba.
    return Promise.all(
      technicians.map(async (tech) => ({
        technician: tech,
        ordersDelivered: await this.prisma.order.count({
          where: {
            tenantId,
            technicianId: tech.id,
            status: OrderStatus.DELIVERED,
          },
        }),
      })),
    );
  }
```

- [ ] **Step 5: Limpiar la semilla**

En `apps/api/prisma/seed.ts`, eliminar el bloque `await prisma.checklistItem.createMany({...})` completo (alrededor de la línea 204) y cualquier arreglo de datos que solo alimente ese bloque.

- [ ] **Step 6: Quitar los modelos del esquema**

En `apps/api/prisma/schema.prisma`, eliminar:
- el modelo `ChecklistItem` completo
- el modelo `LaborEntry` completo
- los enums `ChecklistItemType` y `ConditionRating`
- la línea `checklistItems ChecklistItem[]` del modelo `Order`
- la línea `laborEntries LaborEntry[]` del modelo `Order`
- la relación inversa de `LaborEntry` en el modelo `User` (buscar `laborEntries` ahí)

- [ ] **Step 7: Migración**

```bash
cd apps/api && npx prisma migrate dev --name drop_checklist_and_labor && npx prisma generate
docker exec sistema-taller-motos-postgres-1 psql -U postgres -d taller_motos -c "\dt" | grep -E "checklist|labor" || echo "tablas eliminadas correctamente"
```

- [ ] **Step 8: Limpiar el paquete compartido**

En `packages/shared/src/enums.ts`, eliminar `ChecklistItemType`, `ConditionRating` y `CHECKLIST_ITEM_LABELS` (y cualquier etiqueta de condición asociada).

- [ ] **Step 9: Verificar**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: ambos limpios. Si el build se queja de `@taller/shared`, reconstruirlo con `pnpm --filter @taller/shared build`.

- [ ] **Step 10: Commit**

```bash
git add -A apps/api packages/shared
git commit -m "Remove the checklist and labor features nobody used"
```

---

## Task 4: Backend — la cotización deja de ser visible para el técnico

**Files:**
- Modify: `apps/api/src/orders/quotations/quotations.controller.ts`

- [ ] **Step 1: Ajustar los roles**

En `apps/api/src/orders/quotations/quotations.controller.ts`:

- El `@Get()` **no tiene** decorador `@Roles` hoy, lo que significa que cualquier rol autenticado puede leerlo (`RolesGuard` deja pasar cuando falta el decorador — ver `apps/api/src/common/guards/roles.guard.ts`). Agregarle:

```ts
@Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
```

- El `@Put()` (upsert) cambia de `@Roles(Role.ADMIN, Role.MANAGER, Role.TECHNICIAN, Role.RECEPTIONIST)` a:

```ts
@Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
```

- `approve` y `reject` ya son `@Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)`: no se tocan.

- [ ] **Step 2: Verificar contra la API**

Con el servidor corriendo:

```bash
T=$(curl -s -X POST http://127.0.0.1:3001/api/auth/login -H "Content-Type: application/json" -d '{"email":"tecnico@tallerdemo.com","password":"Password123!"}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
OID=$(docker exec sistema-taller-motos-postgres-1 psql -U postgres -d taller_motos -t -c "SELECT id FROM orders LIMIT 1;" | tr -d ' \n')
curl -s -o /dev/null -w "técnico -> cotización: %{http_code}\n" "http://127.0.0.1:3001/api/orders/$OID/quotation" -H "Authorization: Bearer $T" -H "X-Branch-Id: 33255f8b-2ef5-49df-a5fe-3d3518180cde"
```
Expected: `403`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/orders/quotations
git commit -m "Keep quotations out of reach of technicians"
```

---

## Task 5: Frontend — pestaña de fotos en dos bloques

**Files:**
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/components/orders/photos-tab.tsx`

- [ ] **Step 1: Tipar el campo nuevo**

En `apps/web/src/lib/types.ts`, en la interfaz `OrderPhoto`, agregar:

```ts
  stage: 'INTAKE' | 'WORK';
```

- [ ] **Step 2: Reescribir `photos-tab.tsx`**

El componente pasa a renderizar dos bloques. Reemplazar el `return` completo de `PhotosTab` (y agregar el subcomponente `PhotoGrid` al final del archivo) por:

```tsx
  const { user } = useAuth();
  const canUpload =
    user?.role === 'ADMIN' ||
    user?.role === 'MANAGER' ||
    user?.role === 'TECHNICIAN';

  const intakePhotos = photos.filter((p) => p.stage === 'INTAKE');
  const workPhotos = photos.filter((p) => p.stage === 'WORK');

  async function handleDelete(photoId: string) {
    try {
      await api.delete(`/orders/${orderId}/photos/${photoId}`);
      toast.success('Foto eliminada');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="font-medium">Fotos de ingreso</h3>
          <p className="text-sm text-muted-foreground">
            Cómo se recibió el vehículo. Este registro no se modifica.
          </p>
        </div>
        <PhotoGrid
          photos={intakePhotos}
          emptyText="No se tomaron fotos al recibir el vehículo."
        />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="font-medium">Evidencia del trabajo</h3>
          <p className="text-sm text-muted-foreground">
            Fotos del trabajo realizado por el técnico.
          </p>
        </div>

        {canUpload && (
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as PhotoCategory)}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Sin categoría (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload /> {isUploading ? 'Subiendo...' : 'Subir foto'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        )}

        <PhotoGrid
          photos={workPhotos}
          emptyText="Aún no hay evidencia del trabajo."
          onDelete={canUpload ? handleDelete : undefined}
        />
      </section>
    </div>
  );
}

function PhotoGrid({
  photos,
  emptyText,
  onDelete,
}: {
  photos: OrderPhoto[];
  emptyText: string;
  onDelete?: (photoId: string) => void;
}) {
  if (photos.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo) => (
        <div key={photo.id} className="flex flex-col gap-2">
          <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
            <Image
              src={
                photo.url.startsWith('http')
                  ? photo.url
                  : `${API_ORIGIN}${photo.url}`
              }
              alt={
                photo.category
                  ? CATEGORY_LABELS[photo.category]
                  : 'Foto de la orden'
              }
              fill
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Badge variant="secondary" className="w-fit">
              {photo.category ? CATEGORY_LABELS[photo.category] : 'Sin categoría'}
            </Badge>
            {onDelete && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(photo.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

Ajustar los imports del archivo: agregar `Trash2` a los de `lucide-react` y `useAuth` al import que ya trae `getErrorMessage` de `@/components/providers/auth-provider`.

- [ ] **Step 3: Verificar build**

```bash
pnpm --filter @taller/web build
```
Expected: cero errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/components/orders/photos-tab.tsx
git commit -m "Split the photos tab into intake record and work evidence"
```

---

## Task 6: Frontend — diagnóstico de tres campos y limpieza de pestañas

**Files:**
- Modify: `apps/web/src/components/orders/diagnosis-tab.tsx`
- Modify: `apps/web/src/app/(app)/orders/[id]/page.tsx`
- Modify: `apps/web/src/lib/types.ts`
- Delete: `apps/web/src/components/orders/checklist-tab.tsx`
- Delete: `apps/web/src/components/orders/labor-tab.tsx`

- [ ] **Step 1: Recortar el formulario de diagnóstico**

En `apps/web/src/components/orders/diagnosis-tab.tsx`, el estado inicial queda:

```tsx
  const [form, setForm] = React.useState({
    description: diagnosis?.description ?? '',
    faultFound: diagnosis?.faultFound ?? '',
    testsPerformed: diagnosis?.testsPerformed ?? '',
  });
```

y el guardado:

```tsx
      await api.put(`/orders/${orderId}/diagnosis`, {
        description: form.description,
        faultFound: form.faultFound || undefined,
        testsPerformed: form.testsPerformed || undefined,
      });
```

En el JSX, dejar solo los tres campos —"Descripción técnica", "Falla encontrada", "Pruebas realizadas"— y **eliminar** los bloques de Voltaje de batería, Estado del controlador, Estado del motor, Observaciones, Tiempo estimado y Costo estimado. Marcar los dos opcionales en su etiqueta:

```tsx
          <Label>Falla encontrada (opcional)</Label>
```
```tsx
          <Label>Pruebas realizadas (opcional)</Label>
```

`<DiagnosisParts ... />` se conserva tal cual al final del componente.

- [ ] **Step 2: Borrar los componentes muertos**

```bash
rm apps/web/src/components/orders/checklist-tab.tsx apps/web/src/components/orders/labor-tab.tsx
```

- [ ] **Step 3: Limpiar los tipos**

En `apps/web/src/lib/types.ts`:
- eliminar las interfaces `ChecklistItem` y `LaborEntry`
- eliminar `checklistItems` y `laborEntries` de la interfaz `Order`
- en la interfaz `Diagnosis`, eliminar `batteryVoltage`, `controllerStatus`, `motorStatus`, `observations`, `estimatedTimeHours`, `estimatedCost`, y volver `faultFound` opcional (`faultFound?: string | null`)

- [ ] **Step 4: Reconstruir las pestañas**

En `apps/web/src/app/(app)/orders/[id]/page.tsx`:
- eliminar los imports de `ChecklistTab` y `LaborTab`
- agregar `useAuth` al import de `@/components/providers/auth-provider` (si el archivo aún no lo importa, agregar el import completo)
- dentro del componente, junto a los demás hooks:

```tsx
  const { user } = useAuth();
  const isTechnician = user?.role === 'TECHNICIAN';
```

- reemplazar el bloque `<Tabs ...>` completo por:

```tsx
      <Tabs defaultValue="diagnosis">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="diagnosis">Diagnóstico</TabsTrigger>
          <TabsTrigger value="photos">Fotos</TabsTrigger>
          {!isTechnician && <TabsTrigger value="quotation">Cotización</TabsTrigger>}
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="diagnosis">
          <DiagnosisTab orderId={order.id} diagnosis={order.diagnosis} onUpdated={() => mutate()} />
        </TabsContent>
        <TabsContent value="photos">
          <PhotosTab orderId={order.id} photos={order.photos ?? []} onUpdated={() => mutate()} />
        </TabsContent>
        {!isTechnician && (
          <TabsContent value="quotation">
            <QuotationTab orderId={order.id} quotation={order.quotation} onUpdated={() => mutate()} />
          </TabsContent>
        )}
        <TabsContent value="history">
          <HistoryTab history={order.statusHistory ?? []} />
        </TabsContent>
      </Tabs>
```

- [ ] **Step 5: Verificar build**

```bash
pnpm --filter @taller/web build
```
Expected: cero errores. Si algo más importaba los tipos borrados, el compilador lo señalará — corregirlo ahí.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web
git commit -m "Trim the order tabs to diagnosis, photos, quotation and history"
```

---

## Task 7: Verificación final

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Build y tests completos**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
pnpm --filter @taller/web build
```
Expected: los tres limpios.

Lint solo de lo tocado (un `pnpm lint` completo reformatea todo el repo y se cuelga):
```bash
cd apps/api && npx eslint src/orders/ src/dashboard/dashboard.service.ts
cd ../web && npx eslint src/components/orders/ "src/app/(app)/orders/[id]/page.tsx" src/lib/types.ts
```

- [ ] **Step 2: Verificar la API**

```bash
BR=33255f8b-2ef5-49df-a5fe-3d3518180cde
login(){ curl -s -X POST http://127.0.0.1:3001/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"Password123!\"}" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4; }
A=$(login admin@tallerdemo.com); T=$(login tecnico@tallerdemo.com)
OID=$(docker exec sistema-taller-motos-postgres-1 psql -U postgres -d taller_motos -t -c "SELECT id FROM orders LIMIT 1;" | tr -d ' \n')
PID=$(docker exec sistema-taller-motos-postgres-1 psql -U postgres -d taller_motos -t -c "SELECT id FROM order_photos WHERE stage='INTAKE' LIMIT 1;" | tr -d ' \n')

curl -s -o /dev/null -w "técnico -> cotización (403): %{http_code}\n" "http://127.0.0.1:3001/api/orders/$OID/quotation" -H "Authorization: Bearer $T" -H "X-Branch-Id: $BR"
curl -s -o /dev/null -w "checklist (404, ya no existe): %{http_code}\n" "http://127.0.0.1:3001/api/orders/$OID/checklist" -H "Authorization: Bearer $A" -H "X-Branch-Id: $BR"
curl -s -o /dev/null -w "mano de obra (404, ya no existe): %{http_code}\n" "http://127.0.0.1:3001/api/orders/$OID/labor" -H "Authorization: Bearer $A" -H "X-Branch-Id: $BR"
curl -s -w "\nborrar foto de ingreso (400): " -o /dev/null -X DELETE "http://127.0.0.1:3001/api/orders/$OID/photos/$PID" -H "Authorization: Bearer $A" -H "X-Branch-Id: $BR" -w "%{http_code}\n"
```

- [ ] **Step 3: Prueba manual en el navegador**

- [ ] Como **admin**, abrir una orden: las pestañas son Diagnóstico (abierta por defecto), Fotos, Cotización, Historial. No aparecen Checklist ni Mano de obra.
- [ ] En Fotos: se ven dos bloques. "Fotos de ingreso" muestra las de la recepción sin botones de subir ni borrar. "Evidencia del trabajo" tiene el botón de subir.
- [ ] Subir una foto de evidencia y confirmar que aparece en el bloque de abajo, no arriba. Borrarla y confirmar que se va.
- [ ] En Diagnóstico: solo tres campos más los repuestos. Guardar con "Falla encontrada" vacía y confirmar que guarda.
- [ ] Agregar y quitar un repuesto: sigue descontando y reponiendo inventario.
- [ ] Como **técnico**, abrir la misma orden: **no** aparece la pestaña Cotización. Sí puede subir evidencia y editar el diagnóstico.
- [ ] Como **recepción**, abrir la orden: ve las dos galerías pero sin botón de subir evidencia; sí ve la Cotización.

- [ ] **Step 4: Commit final (solo si la prueba manual requirió correcciones)**

```bash
git add -A
git commit -m "Fix issues found during manual verification of the simplified order detail"
```
