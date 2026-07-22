# Módulo de Órdenes de Ingreso (mobile-first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first order-intake wizard (cédula → cliente/vehículo → motivo → fotos → firma → entrega de número de orden y clave de retiro), an admin-configurable catalog of "servicios rápidos", and a pickup-code-gated vehicle delivery flow.

**Architecture:** NestJS backend gets one new module (`quick-services`), a new atomic `POST /orders/intake` endpoint plus a `POST /orders/:id/deliver` endpoint on the existing `orders` module, and small additions to `clients` and the shared Prisma schema. The Next.js frontend gets a new `/orders/new` wizard page (replacing the old "Nueva orden" dialog), two new reusable components (signature pad, photo capture grid), and a small admin panel under Configuración.

**Tech Stack:** NestJS 11, Prisma 7 + PostgreSQL, class-validator/class-transformer, Multer (`@nestjs/platform-express`), Next.js 16 App Router, SWR, Tailwind v4, Radix-based UI kit already in the repo.

---

## Reference spec

Full design: `docs/superpowers/specs/2026-07-21-ordenes-ingreso-mobile-design.md`

## Task order

1. Prisma schema + migration
2. Shared enum package (`VehicleType`)
3. Pickup-code utility (TDD)
4. Backend: `QuickServices` module
5. Backend: `Clients` — lookup by cédula
6. Backend: `Orders` — new DTOs
7. Backend: `Orders` — service changes (intake, deliver, pickup code on create, block manual DELIVERED)
8. Backend: `Orders` — controller changes
9. Backend: `EmailService` — intake confirmation template
10. Frontend: shared types
11. Frontend: `SignaturePad` component
12. Frontend: `PhotoCaptureGrid` component
13. Frontend: `QuickServiceChips` + Settings admin tab
14. Frontend: `/orders/new` wizard — steps 1–3 (cliente, vehículo, motivo)
15. Frontend: `/orders/new` wizard — steps 4–6 (fotos, firma, confirmación) + submit
16. Frontend: replace "Nueva orden" dialog with link to the wizard
17. Frontend: delivery flow on order detail page
18. Frontend: nav label rename + optional photo category
19. Final verification pass

---

### Task 1: Prisma schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create (generated): `apps/api/prisma/migrations/<timestamp>_order_intake_module/migration.sql`

- [ ] **Step 1: Add `VehicleType` enum, right after the existing `enum Role` block**

```prisma
enum VehicleType {
  BICIMOTO
  PATINETA
  MOTO
}
```

- [ ] **Step 2: Add `vehicleType` to `Motorcycle`**

In `model Motorcycle`, add this field right after `model String`:

```prisma
  vehicleType      VehicleType @default(MOTO)
```

- [ ] **Step 3: Add the `QuickService` model**

Add this new model right after `model Tenant { ... }` closes (before the `User` model), and add the inverse relation field to `Tenant`:

```prisma
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
```

In `model Tenant`, add this line next to the other `X[]` relation fields (e.g. next to `appointments Appointment[]`):

```prisma
  quickServices      QuickService[]
```

- [ ] **Step 4: Add pickup-code and signature fields to `Order`**

In `model Order`, add these fields right after `cancelReason String?`:

```prisma
  pickupCode           String?
  pickupCodeVerifiedAt DateTime?
  signatureUrl         String?
  signedAt             DateTime?
```

- [ ] **Step 5: Make `OrderPhoto.category` optional**

In `model OrderPhoto`, change:

```prisma
  category   PhotoCategory
```

to:

```prisma
  category   PhotoCategory?
```

- [ ] **Step 6: Create the migration without applying it (so we can add a backfill statement)**

Run:
```bash
pnpm --filter @taller/api exec prisma migrate dev --name order_intake_module --create-only
```
Expected: a new folder `apps/api/prisma/migrations/<timestamp>_order_intake_module/` is created with a `migration.sql` file, and the CLI prints that no migration was applied yet.

- [ ] **Step 7: Append a backfill statement to the generated `migration.sql`**

Open the newly created `apps/api/prisma/migrations/<timestamp>_order_intake_module/migration.sql` and add this at the very end of the file:

```sql

-- Backfill pickup codes for orders created before this feature existed
UPDATE "orders"
SET "pickupCode" = lpad(floor(random() * 900000 + 100000)::int::text, 6, '0')
WHERE "pickupCode" IS NULL;
```

- [ ] **Step 8: Apply the migration**

Run:
```bash
pnpm --filter @taller/api exec prisma migrate dev
```
Expected: `Applying migration ...order_intake_module` followed by `Your database is now in sync with your schema.`

- [ ] **Step 9: Regenerate the Prisma client**

Run:
```bash
pnpm --filter @taller/api prisma:generate
```
Expected: `Generated Prisma Client` with no errors. Confirm `apps/api/src/generated/prisma/enums.ts` now exports `VehicleType`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/prisma
git commit -m "Add VehicleType, QuickService, pickup code and signature fields to schema"
```

---

### Task 2: Shared enum package

**Files:**
- Modify: `packages/shared/src/enums.ts`

- [ ] **Step 1: Add `VehicleType` and its labels**

Add at the end of `packages/shared/src/enums.ts`:

```ts
export const VehicleType = {
  BICIMOTO: 'BICIMOTO',
  PATINETA: 'PATINETA',
  MOTO: 'MOTO',
} as const;
export type VehicleType = (typeof VehicleType)[keyof typeof VehicleType];

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  BICIMOTO: 'Bicimoto',
  PATINETA: 'Patineta',
  MOTO: 'Moto',
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/shared/src/enums.ts
git commit -m "Add VehicleType to shared enums package"
```

---

### Task 3: Pure utilities — pickup code + reason combining (TDD)

**Files:**
- Create: `apps/api/src/common/utils/pickup-code.util.ts`
- Test: `apps/api/src/common/utils/pickup-code.util.spec.ts`
- Create: `apps/api/src/orders/intake-reason.util.ts`
- Test: `apps/api/src/orders/intake-reason.util.spec.ts`

- [ ] **Step 1: Write the failing test for the pickup code**

```ts
import { generatePickupCode } from './pickup-code.util';

describe('generatePickupCode', () => {
  it('generates a 6-digit numeric string', () => {
    for (let i = 0; i < 50; i++) {
      const code = generatePickupCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('generates values across the full range, not just small numbers', () => {
    const codes = Array.from({ length: 200 }, () => Number(generatePickupCode()));
    expect(Math.min(...codes)).toBeGreaterThanOrEqual(100_000);
    expect(Math.max(...codes)).toBeLessThanOrEqual(999_999);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @taller/api test pickup-code.util`
Expected: FAIL — `Cannot find module './pickup-code.util'`

- [ ] **Step 3: Implement the pickup code generator**

```ts
import { randomInt } from 'crypto';

/** Generates a random 6-digit numeric pickup code, e.g. "482931". */
export function generatePickupCode(): string {
  return String(randomInt(100_000, 1_000_000));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @taller/api test pickup-code.util`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for combining quick-service labels with free text**

```ts
import { buildIntakeReason } from './intake-reason.util';

describe('buildIntakeReason', () => {
  it('joins quick-service labels and the free-text description', () => {
    expect(buildIntakeReason(['Mantenimiento 3ro', 'Cambio de batería'], 'No enciende')).toBe(
      'Mantenimiento 3ro, Cambio de batería — No enciende',
    );
  });

  it('works with only quick-service labels', () => {
    expect(buildIntakeReason(['Diagnóstico'], '')).toBe('Diagnóstico');
  });

  it('works with only free text', () => {
    expect(buildIntakeReason([], 'La moto no enciende')).toBe('La moto no enciende');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter @taller/api test intake-reason.util`
Expected: FAIL — `Cannot find module './intake-reason.util'`

- [ ] **Step 7: Implement `buildIntakeReason`**

```ts
/** Combines the labels of the selected quick-service tags with the client's free-text description. */
export function buildIntakeReason(quickServiceLabels: string[], description: string): string {
  return [quickServiceLabels.join(', '), description].filter((part) => part.trim() !== '').join(' — ');
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter @taller/api test intake-reason.util`
Expected: PASS (3 tests)

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/common/utils/pickup-code.util.ts apps/api/src/common/utils/pickup-code.util.spec.ts apps/api/src/orders/intake-reason.util.ts apps/api/src/orders/intake-reason.util.spec.ts
git commit -m "Add pickup code generator and intake reason combining utilities"
```

---

### Task 4: Backend — `QuickServices` module

**Files:**
- Create: `apps/api/src/quick-services/dto/create-quick-service.dto.ts`
- Create: `apps/api/src/quick-services/dto/update-quick-service.dto.ts`
- Create: `apps/api/src/quick-services/dto/reorder-quick-services.dto.ts`
- Create: `apps/api/src/quick-services/quick-services.service.ts`
- Create: `apps/api/src/quick-services/quick-services.controller.ts`
- Create: `apps/api/src/quick-services/quick-services.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the DTOs**

`apps/api/src/quick-services/dto/create-quick-service.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateQuickServiceDto {
  @ApiProperty({ example: 'Mantenimiento 3ro' })
  @IsString()
  @MinLength(1)
  label: string;
}
```

`apps/api/src/quick-services/dto/update-quick-service.dto.ts`:
```ts
import { PartialType } from '@nestjs/swagger';
import { CreateQuickServiceDto } from './create-quick-service.dto';

export class UpdateQuickServiceDto extends PartialType(CreateQuickServiceDto) {}
```

`apps/api/src/quick-services/dto/reorder-quick-services.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class ReorderQuickServicesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  orderedIds: string[];
}
```

- [ ] **Step 2: Create the service**

`apps/api/src/quick-services/quick-services.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuickServiceDto } from './dto/create-quick-service.dto';
import { UpdateQuickServiceDto } from './dto/update-quick-service.dto';
import { ReorderQuickServicesDto } from './dto/reorder-quick-services.dto';

@Injectable()
export class QuickServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.quickService.findMany({
      where: { tenantId, isActive: true },
      orderBy: { position: 'asc' },
    });
  }

  async create(tenantId: string, dto: CreateQuickServiceDto) {
    const last = await this.prisma.quickService.findFirst({
      where: { tenantId },
      orderBy: { position: 'desc' },
    });
    return this.prisma.quickService.create({
      data: { tenantId, label: dto.label, position: (last?.position ?? -1) + 1 },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateQuickServiceDto) {
    await this.assertExists(tenantId, id);
    return this.prisma.quickService.update({ where: { id }, data: dto });
  }

  async remove(tenantId: string, id: string) {
    await this.assertExists(tenantId, id);
    return this.prisma.quickService.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async reorder(tenantId: string, dto: ReorderQuickServicesDto) {
    const owned = await this.prisma.quickService.findMany({
      where: { tenantId, id: { in: dto.orderedIds } },
      select: { id: true },
    });
    if (owned.length !== dto.orderedIds.length) {
      throw new NotFoundException('Alguna etiqueta no pertenece a este taller');
    }
    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.quickService.update({
          where: { id },
          data: { position: index },
        }),
      ),
    );
    return this.findAll(tenantId);
  }

  private async assertExists(tenantId: string, id: string) {
    const service = await this.prisma.quickService.findFirst({
      where: { id, tenantId },
    });
    if (!service) throw new NotFoundException('Servicio rápido no encontrado');
    return service;
  }
}
```

- [ ] **Step 3: Create the controller**

`apps/api/src/quick-services/quick-services.controller.ts`:
```ts
import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QuickServicesService } from './quick-services.service';
import { CreateQuickServiceDto } from './dto/create-quick-service.dto';
import { UpdateQuickServiceDto } from './dto/update-quick-service.dto';
import { ReorderQuickServicesDto } from './dto/reorder-quick-services.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('quick-services')
@Controller('quick-services')
export class QuickServicesController {
  constructor(private readonly quickServicesService: QuickServicesService) {}

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.quickServicesService.findAll(tenantId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('QuickService')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateQuickServiceDto,
  ) {
    return this.quickServicesService.create(tenantId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('QuickService')
  @Patch('reorder')
  reorder(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ReorderQuickServicesDto,
  ) {
    return this.quickServicesService.reorder(tenantId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('QuickService')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateQuickServiceDto,
  ) {
    return this.quickServicesService.update(tenantId, id, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('QuickService')
  @Delete(':id')
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.quickServicesService.remove(tenantId, id);
  }
}
```

Note: `@Patch('reorder')` is declared before `@Patch(':id')` so it is not swallowed by the parameterized route.

- [ ] **Step 4: Create the module**

`apps/api/src/quick-services/quick-services.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { QuickServicesService } from './quick-services.service';
import { QuickServicesController } from './quick-services.controller';

@Module({
  controllers: [QuickServicesController],
  providers: [QuickServicesService],
  exports: [QuickServicesService],
})
export class QuickServicesModule {}
```

- [ ] **Step 5: Register the module in `app.module.ts`**

Add the import:
```ts
import { QuickServicesModule } from './quick-services/quick-services.module';
```

Add `QuickServicesModule` to the `imports` array, right after `AppointmentsModule`.

- [ ] **Step 6: Verify it builds**

Run: `pnpm --filter @taller/api build`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/quick-services apps/api/src/app.module.ts
git commit -m "Add QuickServices module with CRUD and reordering"
```

---

### Task 5: Backend — `Clients` lookup by cédula

**Files:**
- Modify: `apps/api/src/clients/clients.service.ts`
- Modify: `apps/api/src/clients/clients.controller.ts`

- [ ] **Step 1: Add `findByDocumentId` to the service**

In `apps/api/src/clients/clients.service.ts`, add this method right after `findOne`:

```ts
  async findByDocumentId(tenantId: string, documentId: string) {
    const client = await this.prisma.client.findFirst({
      where: { tenantId, documentId, isActive: true },
      include: { motorcycles: { orderBy: { createdAt: 'desc' } } },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }
```

- [ ] **Step 2: Add the endpoint to the controller**

In `apps/api/src/clients/clients.controller.ts`, add this method right after `findAll` (before `findOne`):

```ts
  @Get('by-document/:documentId')
  findByDocumentId(
    @CurrentUser('tenantId') tenantId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.clientsService.findByDocumentId(tenantId, documentId);
  }
```

- [ ] **Step 3: Verify it builds**

Run: `pnpm --filter @taller/api build`
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/clients
git commit -m "Add client lookup by cedula (documentId) for order intake"
```

---

### Task 6: Backend — `Orders` new DTOs

**Files:**
- Create: `apps/api/src/orders/dto/new-client-intake.dto.ts`
- Create: `apps/api/src/orders/dto/new-vehicle-intake.dto.ts`
- Create: `apps/api/src/orders/dto/intake-order.dto.ts`
- Create: `apps/api/src/orders/dto/deliver-order.dto.ts`

- [ ] **Step 1: `new-client-intake.dto.ts`**

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class NewClientIntakeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  documentId: string;

  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;
}
```

- [ ] **Step 2: `new-vehicle-intake.dto.ts`**

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { VehicleType } from '../../generated/prisma/enums';

export class NewVehicleIntakeDto {
  @ApiProperty({ enum: VehicleType })
  @IsEnum(VehicleType)
  vehicleType: VehicleType;

  @ApiProperty()
  @IsString()
  brand: string;

  @ApiProperty()
  @IsString()
  model: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  serialNumber?: string;
}
```

- [ ] **Step 3: `intake-order.dto.ts`**

`@Type()` cannot be combined with a `@Transform()` that JSON-parses a multipart string field — `class-transformer` resolves `@Type()`'s nested instantiation against the pre-`@Transform` raw value, so a string is never promoted to a real DTO instance and `@ValidateNested()` then rejects every request. Do the JSON parse *and* the class instantiation inside one `@Transform`:

```ts
import { BadRequestException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { plainToInstance, Transform } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { NewClientIntakeDto } from './new-client-intake.dto';
import { NewVehicleIntakeDto } from './new-vehicle-intake.dto';

function parseIfJsonString(value: unknown, fieldName: string): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new BadRequestException(`El campo "${fieldName}" no es JSON válido`);
  }
}

function parseNestedField<T extends object>(
  value: unknown,
  dtoClass: new () => T,
  fieldName: string,
): T | undefined {
  if (value === undefined || value === null) return undefined;
  return plainToInstance(dtoClass, parseIfJsonString(value, fieldName));
}

export class IntakeOrderDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiProperty({ required: false, type: NewClientIntakeDto })
  @IsOptional()
  @Transform(({ value }) => parseNestedField(value, NewClientIntakeDto, 'newClient'))
  @ValidateNested()
  newClient?: NewClientIntakeDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  motorcycleId?: string;

  @ApiProperty({ required: false, type: NewVehicleIntakeDto })
  @IsOptional()
  @Transform(({ value }) => parseNestedField(value, NewVehicleIntakeDto, 'newMotorcycle'))
  @ValidateNested()
  newMotorcycle?: NewVehicleIntakeDto;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @Transform(({ value }) => parseIfJsonString(value, 'quickServiceIds'))
  quickServiceIds?: string[];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;
}
```

- [ ] **Step 4: `deliver-order.dto.ts`**

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class DeliverOrderDto {
  @ApiProperty({ example: '482931' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'La clave de retiro debe tener 6 dígitos' })
  pickupCode: string;
}
```

- [ ] **Step 4b: Add a regression test proving the nested multipart JSON validation actually works**

Create `apps/api/src/orders/dto/intake-order.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IntakeOrderDto } from './intake-order.dto';

describe('IntakeOrderDto', () => {
  it('validates successfully with a JSON-string newClient and newMotorcycle (as arrives via multipart/form-data)', async () => {
    const raw = {
      newClient: JSON.stringify({ documentId: '123', firstName: 'Ana', lastName: 'Gómez' }),
      newMotorcycle: JSON.stringify({ vehicleType: 'MOTO', brand: 'Volt', model: 'X1' }),
      description: 'No enciende',
    };
    const dto = plainToInstance(IntakeOrderDto, raw);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects a newClient missing required fields', async () => {
    const raw = {
      newClient: JSON.stringify({ documentId: '123' }),
      newMotorcycle: JSON.stringify({ vehicleType: 'MOTO', brand: 'Volt', model: 'X1' }),
      description: 'No enciende',
    };
    const dto = plainToInstance(IntakeOrderDto, raw);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'newClient')).toBe(true);
  });

  it('allows omitting newClient/newMotorcycle entirely when clientId/motorcycleId are used instead', async () => {
    const raw = {
      clientId: '11111111-1111-4111-8111-111111111111',
      motorcycleId: '22222222-2222-4222-8222-222222222222',
      description: 'No enciende',
    };
    const dto = plainToInstance(IntakeOrderDto, raw);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('throws a BadRequestException for malformed JSON in newClient', () => {
    const raw = { newClient: '{not valid json', description: 'x' };
    expect(() => plainToInstance(IntakeOrderDto, raw)).toThrow('newClient');
  });
});
```

- [ ] **Step 5: Verify it builds and the new tests pass**

Run: `pnpm --filter @taller/api build`
Expected: no TypeScript errors (these DTOs aren't wired up to a controller yet, so this just checks syntax).

Run: `pnpm --filter @taller/api test intake-order.dto`
Expected: PASS (4 tests) — this is the regression test for the `@Transform`/nested-validation bug described in Step 3.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/orders/dto
git commit -m "Add DTOs for order intake and delivery"
```

---

### Task 7: Backend — `Orders` service changes

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts`

- [ ] **Step 1: Update imports and constructor**

Replace the top of the file (imports + class opening + constructor) with:

```ts
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { IntakeOrderDto } from './dto/intake-order.dto';
import { DeliverOrderDto } from './dto/deliver-order.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { OrderStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { canTransition } from './order-status.util';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WhatsappService } from '../notifications/whatsapp.service';
import { EmailService } from '../notifications/email.service';
import { StorageService } from '../storage/storage.service';
import { generatePickupCode } from '../common/utils/pickup-code.util';
import { buildIntakeReason } from './intake-reason.util';

export const ORDER_DETAIL_INCLUDE = {
  client: true,
  motorcycle: true,
  receptionist: { select: { id: true, firstName: true, lastName: true } },
  technician: { select: { id: true, firstName: true, lastName: true } },
  checklistItems: true,
  photos: { orderBy: { uploadedAt: 'desc' as const } },
  diagnosis: { include: { requiredParts: true } },
  quotation: { include: { items: true } },
  statusHistory: {
    orderBy: { createdAt: 'desc' as const },
    include: { changedBy: { select: { firstName: true, lastName: true } } },
  },
  laborEntries: { orderBy: { startTime: 'desc' as const } },
  invoice: true,
  payments: true,
  warranties: true,
} as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly whatsapp: WhatsappService,
    private readonly email: EmailService,
    private readonly storage: StorageService,
  ) {}
```

- [ ] **Step 2: Add the pickup-code generator helper**

Add this private method inside the class, right after `assertOrderExists`:

```ts
  /**
   * Only safe to call AFTER `tx.tenant.update({ data: { nextOrderNumber: { increment: 1 } } })`
   * in the same transaction — that update takes a row lock on the tenant that serializes
   * concurrent order-creating transactions, which is what makes this uniqueness check race-free.
   * Calling this before that update (or in a transaction that doesn't touch the tenant row)
   * would not be safe under Postgres's default READ COMMITTED isolation.
   */
  private async generateUniquePickupCode(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generatePickupCode();
      const clash = await tx.order.findFirst({
        where: {
          tenantId,
          pickupCode: code,
          status: { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] },
        },
      });
      if (!clash) return code;
    }
    throw new InternalServerErrorException(
      'No se pudo generar una clave de retiro única, intenta de nuevo',
    );
  }
```

- [ ] **Step 3: Add a helper that reactivates a soft-deleted client instead of colliding on `documentId`**

`Client.documentId` has a `@@unique([tenantId, documentId])` constraint that is NOT relaxed by `isActive: false` (soft-delete). If a client was previously deactivated and later comes back with the same cédula through the "cliente nuevo" branch of the intake wizard, a blind `tx.client.create(...)` would throw an uncaught Prisma `P2002` (raw 500). Add this private method right after `generateUniquePickupCode`:

```ts
  private async createOrReactivateClient(
    tx: Prisma.TransactionClient,
    tenantId: string,
    newClient: {
      documentId: string;
      firstName: string;
      lastName: string;
      phone?: string;
      email?: string;
      address?: string;
    },
  ) {
    const inactive = await tx.client.findFirst({
      where: { tenantId, documentId: newClient.documentId, isActive: false },
    });
    if (inactive) {
      return tx.client.update({
        where: { id: inactive.id },
        data: { ...newClient, isActive: true },
      });
    }
    try {
      return await tx.client.create({ data: { tenantId, ...newClient } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await tx.client.findFirst({
          where: { tenantId, documentId: newClient.documentId },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }
```

This mirrors the reactivation-over-recreation approach for the common real-world case (a returning customer), rather than surfacing a raw uniqueness error at the front desk. The `try/catch` around the `create` additionally covers the case of two concurrent intake requests creating the same brand-new `documentId` at the same time — the loser reuses the winner's row instead of crashing with an unhandled `P2002`.

- [ ] **Step 3b: Add helpers for consistent 404s on the in-transaction client/motorcycle re-check**

`intake()` (Step 6 below) validates `clientId`/`motorcycleId` ownership once before uploading files, then must re-validate inside the transaction immediately before use. Using Prisma's `findFirstOrThrow` there would throw Prisma's own error type instead of this file's usual `NotFoundException`. Add these two private methods right after `createOrReactivateClient`:

```ts
  private async mustFindTenantClient(
    tx: Prisma.TransactionClient,
    tenantId: string,
    clientId: string,
  ) {
    const client = await tx.client.findFirst({ where: { id: clientId, tenantId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  private async mustFindTenantMotorcycle(
    tx: Prisma.TransactionClient,
    tenantId: string,
    motorcycleId: string,
    clientId: string,
  ) {
    const motorcycle = await tx.motorcycle.findFirst({
      where: { id: motorcycleId, tenantId, clientId },
    });
    if (!motorcycle) throw new NotFoundException('Vehículo no encontrado');
    return motorcycle;
  }
```

- [ ] **Step 4: Make `create()` also generate a pickup code**

In the existing `create()` method, inside the `$transaction`, add the pickup code generation and pass it to `tx.order.create`:

```ts
    const order = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { nextOrderNumber: { increment: 1 } },
      });
      const orderNumber = tenant.nextOrderNumber - 1;
      const pickupCode = await this.generateUniquePickupCode(tx, tenantId);

      const created = await tx.order.create({
        data: {
          tenantId,
          orderNumber,
          clientId: dto.clientId,
          motorcycleId: dto.motorcycleId,
          receptionistId,
          technicianId: dto.technicianId,
          reason: dto.reason,
          accessoriesDelivered: dto.accessoriesDelivered,
          status: OrderStatus.RECEIVED,
          pickupCode,
        },
      });
```

(Leave the rest of `create()` — the `orderStatusHistory.create` call and the `return created;` — unchanged.)

- [ ] **Step 5: Block manually setting `DELIVERED` in `updateStatus()`**

In `updateStatus()`, right after `const order = await this.assertOrderExists(tenantId, id);`, add:

```ts
    if (dto.status === OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'Para marcar la orden como entregada, usa la verificación de clave de retiro (POST /orders/:id/deliver).',
      );
    }
```

- [ ] **Step 6: Add the `intake()` method**

Add this method after `update()`:

```ts
  async intake(
    tenantId: string,
    receptionistId: string,
    dto: IntakeOrderDto,
    files: { photos?: Express.Multer.File[]; signature?: Express.Multer.File[] },
  ) {
    const signatureFile = files.signature?.[0];
    if (!signatureFile) {
      throw new BadRequestException('La firma del cliente es obligatoria');
    }
    if (!dto.clientId && !dto.newClient) {
      throw new BadRequestException(
        'Debes indicar un cliente existente o los datos de un cliente nuevo',
      );
    }
    if (!dto.motorcycleId && !dto.newMotorcycle) {
      throw new BadRequestException(
        'Debes indicar un vehículo existente o los datos de un vehículo nuevo',
      );
    }
    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, tenantId },
      });
      if (!client) throw new NotFoundException('Cliente no encontrado');
    }
    if (dto.motorcycleId) {
      const motorcycle = await this.prisma.motorcycle.findFirst({
        where: { id: dto.motorcycleId, tenantId },
      });
      if (!motorcycle) throw new NotFoundException('Vehículo no encontrado');
      if (dto.clientId && motorcycle.clientId !== dto.clientId) {
        throw new BadRequestException('El vehículo no pertenece a ese cliente');
      }
    }

    const photoUrls = await Promise.all(
      (files.photos ?? []).map((file) =>
        this.storage.upload(file.buffer, file.originalname, file.mimetype, 'orders'),
      ),
    );
    const signatureUrl = await this.storage.upload(
      signatureFile.buffer,
      signatureFile.originalname,
      signatureFile.mimetype,
      'signatures',
    );

    const order = await this.prisma.$transaction(async (tx) => {
      const client = dto.clientId
        ? await this.mustFindTenantClient(tx, tenantId, dto.clientId)
        : await this.createOrReactivateClient(tx, tenantId, dto.newClient!);

      const motorcycle = dto.motorcycleId
        ? await this.mustFindTenantMotorcycle(tx, tenantId, dto.motorcycleId, client.id)
        : await tx.motorcycle.create({
            data: {
              tenantId,
              clientId: client.id,
              vehicleType: dto.newMotorcycle!.vehicleType,
              brand: dto.newMotorcycle!.brand,
              model: dto.newMotorcycle!.model,
              color: dto.newMotorcycle!.color,
              serialNumber: dto.newMotorcycle!.serialNumber,
              purchaseDate: dto.newMotorcycle!.purchaseDate
                ? new Date(dto.newMotorcycle!.purchaseDate)
                : undefined,
            },
          });

      const quickServices = dto.quickServiceIds?.length
        ? await tx.quickService.findMany({
            where: { id: { in: dto.quickServiceIds }, tenantId },
          })
        : [];
      const reason = buildIntakeReason(quickServices.map((s) => s.label), dto.description);

      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { nextOrderNumber: { increment: 1 } },
      });
      const pickupCode = await this.generateUniquePickupCode(tx, tenantId);

      const created = await tx.order.create({
        data: {
          tenantId,
          orderNumber: tenant.nextOrderNumber - 1,
          clientId: client.id,
          motorcycleId: motorcycle.id,
          receptionistId,
          reason,
          status: OrderStatus.RECEIVED,
          pickupCode,
          signatureUrl,
          signedAt: new Date(),
          photos: { create: photoUrls.map((url) => ({ url })) },
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: created.id,
          toStatus: OrderStatus.RECEIVED,
          changedById: receptionistId,
          notes: 'Orden creada desde recepción móvil',
        },
      });

      return created;
    });

    return this.findOne(tenantId, order.id);
  }
```

- [ ] **Step 7: Add the `deliver()` method**

Add this method after `intake()`:

```ts
  async deliver(
    tenantId: string,
    id: string,
    userId: string,
    dto: DeliverOrderDto,
  ) {
    const order = await this.assertOrderExists(tenantId, id);
    if (order.status !== OrderStatus.READY_FOR_DELIVERY) {
      throw new BadRequestException(
        'La orden debe estar en estado "Lista para entrega" para poder entregarse',
      );
    }
    if (!order.pickupCode || order.pickupCode !== dto.pickupCode) {
      throw new BadRequestException('La clave de retiro no es correcta');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          status: OrderStatus.DELIVERED,
          deliveredAt: new Date(),
          pickupCodeVerifiedAt: new Date(),
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: OrderStatus.DELIVERED,
          changedById: userId,
          notes: 'Entregado tras verificar clave de retiro',
        },
      });
    });

    const updated = await this.findOne(tenantId, id);
    this.realtime.emitOrderUpdated(tenantId, updated);
    this.notifyStatusChange(updated).catch(() => undefined);
    return updated;
  }
```

- [ ] **Step 8: Add `sendIntakeConfirmationEmail()`**

Add this method after `deliver()`:

```ts
  async sendIntakeConfirmationEmail(tenantId: string, id: string) {
    const order = await this.findOne(tenantId, id);
    if (!order.client.email) {
      throw new BadRequestException('El cliente no tiene correo registrado');
    }
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    await this.email.sendIntakeConfirmation(order.client.email, {
      clientFirstName: order.client.firstName,
      orderNumber: order.orderNumber,
      pickupCode: order.pickupCode ?? '',
      tenantName: tenant.name,
    });
    return { success: true };
  }
```

- [ ] **Step 9: Verify it builds**

Run: `pnpm --filter @taller/api build`
Expected: TypeScript error about `EmailService.sendIntakeConfirmation` not existing yet — that's expected, it's added in Task 9. Confirm there are no *other* errors (all errors mention only `sendIntakeConfirmation`).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/orders/orders.service.ts
git commit -m "Add order intake, delivery and pickup-code generation to OrdersService"
```

---

### Task 8: Backend — `Orders` controller changes

**Files:**
- Modify: `apps/api/src/orders/orders.controller.ts`

- [ ] **Step 1: Update imports**

Replace the import block at the top of the file with:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { IntakeOrderDto } from './dto/intake-order.dto';
import { DeliverOrderDto } from './dto/deliver-order.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { OrderStatus, Role } from '../generated/prisma/enums';
```

- [ ] **Step 2: Add the `intake` endpoint**

Add this method right after `create(...)`:

```ts
  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Order')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'photos', maxCount: 10 },
        { name: 'signature', maxCount: 1 },
      ],
      {
        limits: { fileSize: 8 * 1024 * 1024 },
        fileFilter: (_req, file, callback) => {
          if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
            callback(
              new BadRequestException('Solo se permiten imágenes JPEG, PNG o WEBP'),
              false,
            );
            return;
          }
          callback(null, true);
        },
      },
    ),
  )
  @Post('intake')
  intake(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: IntakeOrderDto,
    @UploadedFiles()
    files: {
      photos?: Express.Multer.File[];
      signature?: Express.Multer.File[];
    },
  ) {
    return this.ordersService.intake(tenantId, userId, dto, files);
  }
```

- [ ] **Step 3: Add the `deliver` and `send-intake-message` endpoints**

Add these methods right after `updateStatus(...)`:

```ts
  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Order')
  @Post(':id/deliver')
  deliver(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: DeliverOrderDto,
  ) {
    return this.ordersService.deliver(tenantId, id, userId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Post(':id/send-intake-message')
  sendIntakeMessage(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.ordersService.sendIntakeConfirmationEmail(tenantId, id);
  }
```

- [ ] **Step 4: Verify it builds**

Run: `pnpm --filter @taller/api build`
Expected: still only the `sendIntakeConfirmation` error from Task 7 (resolved in the next task).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/orders/orders.controller.ts
git commit -m "Add intake, deliver and send-intake-message endpoints to OrdersController"
```

---

### Task 9: Backend — `EmailService` intake confirmation

**Files:**
- Modify: `apps/api/src/notifications/email.service.ts`

- [ ] **Step 1: Add the `sendIntakeConfirmation` method**

Add this method at the end of the `EmailService` class, after `sendOrderStatusUpdate`:

```ts
  async sendIntakeConfirmation(
    to: string,
    data: {
      clientFirstName: string;
      orderNumber: number;
      pickupCode: string;
      tenantName: string;
    },
  ) {
    return this.send({
      to,
      subject: `Hemos recibido tu vehículo — Orden #${data.orderNumber}`,
      html: `
        <p>Hola ${data.clientFirstName}.</p>
        <p>Hemos recibido correctamente tu vehículo en nuestro taller.</p>
        <p>📋 Número de Orden: <strong>${data.orderNumber}</strong><br/>
        🔐 Clave de salida: <strong>${data.pickupCode}</strong></p>
        <p>Esta clave será necesaria para retirar tu vehículo. Por favor, consérvala y no la compartas con terceros.</p>
        <p>Puedes utilizar el número de orden para realizar consultas sobre el estado de la reparación.</p>
        <p>Gracias por confiar en nosotros. Será un gusto atenderte.<br/>Equipo ${data.tenantName}</p>
      `,
    });
  }
```

- [ ] **Step 2: Verify the whole backend builds cleanly now**

Run: `pnpm --filter @taller/api build`
Expected: no errors at all.

- [ ] **Step 3: Verify unit tests still pass**

Run: `pnpm --filter @taller/api test`
Expected: all suites pass (`duration.util.spec.ts`, `order-status.util.spec.ts`, `pickup-code.util.spec.ts`, `intake-reason.util.spec.ts`).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/notifications/email.service.ts
git commit -m "Add intake confirmation email template"
```

---

### Task 10: Frontend — shared types

**Files:**
- Modify: `apps/web/src/lib/types.ts`

- [ ] **Step 1: Import `VehicleType`**

In the `import type { ... } from '@taller/shared';` block at the top, add `VehicleType` to the list.

- [ ] **Step 2: Add `vehicleType` to `Motorcycle`**

Add this field to the `Motorcycle` interface, right after `clientId`/`client`:

```ts
  vehicleType: VehicleType;
```

- [ ] **Step 3: Add pickup/signature fields to `Order`**

Add these fields to the `Order` interface, right after `cancelReason`:

```ts
  pickupCode?: string | null;
  pickupCodeVerifiedAt?: string | null;
  signatureUrl?: string | null;
  signedAt?: string | null;
```

- [ ] **Step 4: Make `OrderPhoto.category` optional**

Change:
```ts
  category: PhotoCategory;
```
to:
```ts
  category?: PhotoCategory | null;
```

- [ ] **Step 5: Add the `QuickService` interface**

Add this new interface anywhere near `Client`/`Motorcycle`:

```ts
export interface QuickService {
  id: string;
  label: string;
  position: number;
  isActive: boolean;
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/types.ts
git commit -m "Add frontend types for vehicle type, quick services and pickup code"
```

---

### Task 11: Frontend — `SignaturePad` component

**Files:**
- Create: `apps/web/src/components/orders/signature-pad.tsx`

- [ ] **Step 1: Implement the component**

```tsx
'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toBlob: () => Promise<Blob | null>;
}

export const SignaturePad = React.forwardRef<SignaturePadHandle, { className?: string }>(
  function SignaturePad({ className }, ref) {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const drawingRef = React.useRef(false);
    const hasDrawnRef = React.useRef(false);
    const lastPointRef = React.useRef<{ x: number; y: number } | null>(null);

    React.useImperativeHandle(ref, () => ({
      isEmpty: () => !hasDrawnRef.current,
      toBlob: () =>
        new Promise((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas) return resolve(null);
          canvas.toBlob((blob) => resolve(blob), 'image/png');
        }),
    }));

    function getPoint(e: React.PointerEvent<HTMLCanvasElement>) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * canvas.width,
        y: ((e.clientY - rect.top) / rect.height) * canvas.height,
      };
    }

    function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      e.currentTarget.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      lastPointRef.current = getPoint(e);
    }

    function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !lastPointRef.current) return;
      const point = getPoint(e);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      lastPointRef.current = point;
      hasDrawnRef.current = true;
    }

    function handlePointerUp() {
      drawingRef.current = false;
      lastPointRef.current = null;
    }

    function handleClear() {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasDrawnRef.current = false;
    }

    return (
      <div className={className}>
        <canvas
          ref={canvasRef}
          width={600}
          height={240}
          className="w-full touch-none rounded-lg border bg-white"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={handleClear}>
          Borrar firma
        </Button>
      </div>
    );
  },
);
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/orders/signature-pad.tsx
git commit -m "Add touch/mouse signature pad component"
```

---

### Task 12: Frontend — `PhotoCaptureGrid` component

**Files:**
- Create: `apps/web/src/components/orders/photo-capture-grid.tsx`

- [ ] **Step 1: Implement the component**

```tsx
'use client';

import * as React from 'react';
import { Camera, Plus, X } from 'lucide-react';

const MIN_SLOTS = 6;
const MAX_PHOTOS = 10;

export function PhotoCaptureGrid({
  files,
  onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const canAddMore = files.length < MAX_PHOTOS;
  const emptySlots = Math.max(0, MIN_SLOTS - files.length - (canAddMore ? 1 : 0));

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && files.length < MAX_PHOTOS) {
      onChange([...files, file]);
    }
    e.target.value = '';
  }

  function handleRemove(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {files.map((file, index) => (
        <div key={index} className="relative aspect-square overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={URL.createObjectURL(file)}
            alt={`Foto ${index + 1}`}
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={() => handleRemove(index)}
            className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      {canAddMore && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground"
        >
          {files.length === 0 ? <Camera className="size-5" /> : <Plus className="size-5" />}
          <span className="text-xs">Agregar foto</span>
        </button>
      )}
      {Array.from({ length: emptySlots }).map((_, i) => (
        <div key={`empty-${i}`} className="aspect-square rounded-lg border border-dashed opacity-40" />
      ))}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelected}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/orders/photo-capture-grid.tsx
git commit -m "Add mobile photo capture grid component (6-10 slots)"
```

---

### Task 13: Frontend — `QuickServiceChips` + Settings admin tab

**Files:**
- Create: `apps/web/src/components/orders/quick-service-chips.tsx`
- Modify: `apps/web/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Create the chips component**

```tsx
'use client';

import { cn } from '@/lib/utils';
import type { QuickService } from '@/lib/types';

export function QuickServiceChips({
  services,
  selectedIds,
  onToggle,
}: {
  services: QuickService[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {services.map((service) => {
        const selected = selectedIds.includes(service.id);
        return (
          <button
            key={service.id}
            type="button"
            onClick={() => onToggle(service.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background text-foreground',
            )}
          >
            {service.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Add imports to `settings/page.tsx`**

Add `ChevronDown`, `ChevronUp` to the `lucide-react` import, and add a `QuickService` import to the `@/lib/types` import line.

- [ ] **Step 3: Add the new tab**

In the `<TabsList>` inside `SettingsPage`, add a third trigger:

```tsx
          <TabsTrigger value="quick-services">Servicios rápidos</TabsTrigger>
```

And add a matching `<TabsContent>` right after the `users` one:

```tsx
        <TabsContent value="quick-services">
          <QuickServicesSettings />
        </TabsContent>
```

- [ ] **Step 4: Add the `QuickServicesSettings` and `QuickServiceForm` components**

Add these at the end of the file:

```tsx
function QuickServicesSettings() {
  const { data: services, mutate } = useApiSWR<QuickService[]>('/quick-services');
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<QuickService | null>(null);

  async function handleMove(index: number, direction: -1 | 1) {
    if (!services) return;
    const next = [...services];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await api.patch('/quick-services/reorder', { orderedIds: next.map((s) => s.id) });
    mutate();
  }

  async function handleDelete(id: string) {
    await api.delete(`/quick-services/${id}`);
    mutate();
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => setEditing(null)}>
              <Plus /> Nuevo servicio rápido
            </Button>
          </DialogTrigger>
          <DialogContent>
            <QuickServiceForm
              editing={editing}
              onSuccess={() => {
                setOpen(false);
                setEditing(null);
                mutate();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex flex-col gap-2">
        {services?.map((service, index) => (
          <div key={service.id} className="flex items-center gap-2 rounded-lg border p-2">
            <div className="flex flex-col">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => handleMove(index, -1)}
                className="disabled:opacity-30"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                disabled={index === services.length - 1}
                onClick={() => handleMove(index, 1)}
                className="disabled:opacity-30"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
            <span className="flex-1 text-sm">{service.label}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(service);
                setOpen(true);
              }}
            >
              Editar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleDelete(service.id)}>
              Eliminar
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickServiceForm({
  editing,
  onSuccess,
}: {
  editing: QuickService | null;
  onSuccess: () => void;
}) {
  const [label, setLabel] = React.useState(editing?.label ?? '');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editing) {
        await api.patch(`/quick-services/${editing.id}`, { label });
      } else {
        await api.post('/quick-services', { label });
      }
      toast.success('Guardado');
      onSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>{editing ? 'Editar servicio rápido' : 'Nuevo servicio rápido'}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-1.5 py-4">
        <Label>Nombre</Label>
        <Input required value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || !label}>
          {isSubmitting ? 'Guardando...' : 'Guardar'}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 5: Verify the frontend builds**

Run: `pnpm --filter @taller/web build`
Expected: no TypeScript/ESLint errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/orders/quick-service-chips.tsx apps/web/src/app/\(app\)/settings/page.tsx
git commit -m "Add quick services admin panel and chips component"
```

---

### Task 14: Frontend — `/orders/new` wizard (steps 1–3)

**Files:**
- Create: `apps/web/src/app/(app)/orders/new/page.tsx`

- [ ] **Step 1: Scaffold the page with state and step 1 (cliente)**

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { QuickServiceChips } from '@/components/orders/quick-service-chips';
import { PhotoCaptureGrid } from '@/components/orders/photo-capture-grid';
import { SignaturePad, type SignaturePadHandle } from '@/components/orders/signature-pad';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { VehicleType, VEHICLE_TYPE_LABELS } from '@taller/shared';
import type { Client, Motorcycle, Order, QuickService } from '@/lib/types';

type Step = 'client' | 'vehicle' | 'reason' | 'photos' | 'signature' | 'done';
const STEP_ORDER: Step[] = ['client', 'vehicle', 'reason', 'photos', 'signature', 'done'];
const STEP_LABELS: Record<Step, string> = {
  client: 'Cliente',
  vehicle: 'Vehículo',
  reason: 'Motivo',
  photos: 'Fotos',
  signature: 'Firma',
  done: 'Listo',
};

interface NewClientForm {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
}

interface NewVehicleForm {
  vehicleType: VehicleType;
  brand: string;
  model: string;
  color: string;
  purchaseDate: string;
  serialNumber: string;
}

interface IntakeResult {
  order: Order;
  message: string;
  whatsappPhone: string | null;
}

export default function NewOrderWizardPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>('client');

  const [documentId, setDocumentId] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const [foundClient, setFoundClient] = React.useState<(Client & { motorcycles: Motorcycle[] }) | null>(
    null,
  );
  const [searchedOnce, setSearchedOnce] = React.useState(false);
  const [newClientForm, setNewClientForm] = React.useState<NewClientForm>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
  });

  const [selectedMotorcycleId, setSelectedMotorcycleId] = React.useState('');
  const [isNewVehicle, setIsNewVehicle] = React.useState(false);
  const [newVehicleForm, setNewVehicleForm] = React.useState<NewVehicleForm>({
    vehicleType: VehicleType.MOTO,
    brand: '',
    model: '',
    color: '',
    purchaseDate: '',
    serialNumber: '',
  });

  const { data: quickServices } = useApiSWR<QuickService[]>('/quick-services');
  const [selectedQuickServiceIds, setSelectedQuickServiceIds] = React.useState<string[]>([]);
  const [description, setDescription] = React.useState('');

  const [photos, setPhotos] = React.useState<File[]>([]);
  const signatureRef = React.useRef<SignaturePadHandle>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<IntakeResult | null>(null);

  async function handleSearchClient() {
    setIsSearching(true);
    setSearchedOnce(false);
    try {
      const client = await api.get<Client & { motorcycles: Motorcycle[] }>(
        `/clients/by-document/${encodeURIComponent(documentId)}`,
      );
      setFoundClient(client);
    } catch {
      setFoundClient(null);
    } finally {
      setIsSearching(false);
      setSearchedOnce(true);
    }
  }

  const clientStepValid = foundClient
    ? true
    : searchedOnce && newClientForm.firstName.trim() !== '' && newClientForm.lastName.trim() !== '';

  function goNext() {
    const index = STEP_ORDER.indexOf(step);
    setStep(STEP_ORDER[Math.min(index + 1, STEP_ORDER.length - 1)]);
  }

  function goBack() {
    const index = STEP_ORDER.indexOf(step);
    setStep(STEP_ORDER[Math.max(index - 1, 0)]);
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => router.push('/orders')}>
          <ArrowLeft className="size-4" /> Cancelar
        </Button>
        <span className="text-sm text-muted-foreground">
          Paso {STEP_ORDER.indexOf(step) + 1} de {STEP_ORDER.length}: {STEP_LABELS[step]}
        </span>
      </div>

      {step === 'client' && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex flex-col gap-1.5">
              <Label>Cédula del cliente</Label>
              <div className="flex gap-2">
                <Input
                  value={documentId}
                  onChange={(e) => {
                    setDocumentId(e.target.value);
                    setFoundClient(null);
                    setSearchedOnce(false);
                  }}
                  placeholder="1020304050"
                />
                <Button
                  type="button"
                  onClick={handleSearchClient}
                  disabled={isSearching || !documentId.trim()}
                >
                  <Search className="size-4" /> Buscar
                </Button>
              </div>
            </div>

            {foundClient && (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  {foundClient.firstName} {foundClient.lastName}
                </p>
                <p className="text-muted-foreground">{foundClient.phone ?? 'Sin teléfono'}</p>
              </div>
            )}

            {searchedOnce && !foundClient && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">
                  No encontramos un cliente con esa cédula. Regístralo:
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label>Nombre completo</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Nombre"
                      value={newClientForm.firstName}
                      onChange={(e) =>
                        setNewClientForm({ ...newClientForm, firstName: e.target.value })
                      }
                    />
                    <Input
                      placeholder="Apellido"
                      value={newClientForm.lastName}
                      onChange={(e) =>
                        setNewClientForm({ ...newClientForm, lastName: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Teléfono</Label>
                  <Input
                    value={newClientForm.phone}
                    onChange={(e) => setNewClientForm({ ...newClientForm, phone: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Correo</Label>
                  <Input
                    type="email"
                    value={newClientForm.email}
                    onChange={(e) => setNewClientForm({ ...newClientForm, email: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Dirección</Label>
                  <Input
                    value={newClientForm.address}
                    onChange={(e) => setNewClientForm({ ...newClientForm, address: e.target.value })}
                  />
                </div>
              </div>
            )}

            <Button onClick={goNext} disabled={!clientStepValid} className="mt-2">
              Siguiente <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 2: Verify it compiles so far**

Run: `pnpm --filter @taller/web build`
Expected: it will fail because the file's JSX isn't closed and `step === 'vehicle'` etc. aren't handled yet — that's expected at this point, since the rest is added in the next steps below (same file, same task). Do not commit yet.

Continue directly to the next steps of this task (no separate commit) — steps 3-6 below all belong to this same file, added before the final closing `</div>` of the returned JSX.

- [ ] **Step 3: Add the "vehicle" step**

Insert this block right after the `{step === 'client' && ( ... )}` block closes:

```tsx
      {step === 'vehicle' && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            {foundClient && foundClient.motorcycles.length > 0 && !isNewVehicle && (
              <div className="flex flex-col gap-1.5">
                <Label>Selecciona el vehículo</Label>
                <Select value={selectedMotorcycleId} onValueChange={setSelectedMotorcycleId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Elige un vehículo" />
                  </SelectTrigger>
                  <SelectContent>
                    {foundClient.motorcycles.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.brand} {m.model} {m.serialNumber ? `(${m.serialNumber})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="link" className="w-fit px-0" onClick={() => setIsNewVehicle(true)}>
                  + Vehículo nuevo
                </Button>
              </div>
            )}

            {(isNewVehicle || !foundClient || foundClient.motorcycles.length === 0) && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Tipo de vehículo</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setNewVehicleForm({ ...newVehicleForm, vehicleType: value as VehicleType })
                        }
                        className={`rounded-lg border p-3 text-sm ${
                          newVehicleForm.vehicleType === value
                            ? 'border-primary bg-primary text-primary-foreground'
                            : ''
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label>Marca</Label>
                    <Input
                      value={newVehicleForm.brand}
                      onChange={(e) => setNewVehicleForm({ ...newVehicleForm, brand: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label>Modelo</Label>
                    <Input
                      value={newVehicleForm.model}
                      onChange={(e) => setNewVehicleForm({ ...newVehicleForm, model: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Color</Label>
                  <Input
                    value={newVehicleForm.color}
                    onChange={(e) => setNewVehicleForm({ ...newVehicleForm, color: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Fecha de compra</Label>
                  <Input
                    type="date"
                    value={newVehicleForm.purchaseDate}
                    onChange={(e) =>
                      setNewVehicleForm({ ...newVehicleForm, purchaseDate: e.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Número serial del chasis</Label>
                  <Input
                    value={newVehicleForm.serialNumber}
                    onChange={(e) =>
                      setNewVehicleForm({ ...newVehicleForm, serialNumber: e.target.value })
                    }
                  />
                </div>
                {foundClient && foundClient.motorcycles.length > 0 && (
                  <Button type="button" variant="link" className="w-fit px-0" onClick={() => setIsNewVehicle(false)}>
                    Usar un vehículo existente
                  </Button>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="size-4" /> Atrás
              </Button>
              <Button
                className="flex-1"
                onClick={goNext}
                disabled={
                  isNewVehicle || !foundClient || foundClient.motorcycles.length === 0
                    ? !newVehicleForm.brand || !newVehicleForm.model
                    : !selectedMotorcycleId
                }
              >
                Siguiente <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 4: Add the "reason" step**

Insert this block right after the `{step === 'vehicle' && ( ... )}` block closes:

```tsx
      {step === 'reason' && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <div className="flex flex-col gap-1.5">
              <Label>Servicios rápidos</Label>
              <QuickServiceChips
                services={quickServices ?? []}
                selectedIds={selectedQuickServiceIds}
                onToggle={(id) =>
                  setSelectedQuickServiceIds((prev) =>
                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                  )
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Descripción del cliente</Label>
              <Textarea
                rows={4}
                placeholder="Ej: la moto perdió fuerza en las subidas..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="size-4" /> Atrás
              </Button>
              <Button
                className="flex-1"
                onClick={goNext}
                disabled={!description.trim() && selectedQuickServiceIds.length === 0}
              >
                Siguiente <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 5: Close the component for now with a temporary placeholder for the remaining steps**

Add this right after the `reason` block, followed by the closing `</div>` of the component:

```tsx
      {(step === 'photos' || step === 'signature' || step === 'done') && (
        <p className="text-sm text-muted-foreground">(continúa en la siguiente tarea)</p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify it builds**

Run: `pnpm --filter @taller/web build`
Expected: no TypeScript/ESLint errors.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(app)/orders/new/page.tsx"
git commit -m "Add order intake wizard: client, vehicle and reason steps"
```

---

### Task 15: Frontend — `/orders/new` wizard (steps 4–6) + submit

**Files:**
- Modify: `apps/web/src/app/(app)/orders/new/page.tsx`

- [ ] **Step 1: Replace the placeholder block with the real photos/signature/done steps**

Replace the block added in Task 14 Step 5:

```tsx
      {(step === 'photos' || step === 'signature' || step === 'done') && (
        <p className="text-sm text-muted-foreground">(continúa en la siguiente tarea)</p>
      )}
```

with:

```tsx
      {step === 'photos' && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <Label>Fotos del vehículo (hasta 10)</Label>
            <PhotoCaptureGrid files={photos} onChange={setPhotos} />
            <div className="flex gap-2">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="size-4" /> Atrás
              </Button>
              <Button className="flex-1" onClick={goNext}>
                Siguiente <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'signature' && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6">
            <Label>Firma del cliente</Label>
            <SignaturePad ref={signatureRef} />
            <p className="text-xs text-muted-foreground">
              Al firmar, el cliente acepta los términos y condiciones del servicio de recepción
              y reparación de este taller.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={goBack} disabled={isSubmitting}>
                <ArrowLeft className="size-4" /> Atrás
              </Button>
              <Button className="flex-1" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Creando orden...' : 'Confirmar y crear orden'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 'done' && result && (
        <Card>
          <CardContent className="flex flex-col gap-4 pt-6 text-center">
            <div>
              <p className="text-sm text-muted-foreground">Número de orden</p>
              <p className="text-3xl font-bold">#{result.order.orderNumber}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Clave de salida</p>
              <p className="text-3xl font-bold tracking-widest">{result.order.pickupCode}</p>
            </div>
            <div className="flex flex-col gap-2">
              {result.whatsappPhone && (
                <Button
                  onClick={() =>
                    window.open(
                      `https://wa.me/${result.whatsappPhone}?text=${encodeURIComponent(result.message)}`,
                      '_blank',
                    )
                  }
                >
                  Enviar por WhatsApp
                </Button>
              )}
              {result.order.client?.email && (
                <Button variant="outline" onClick={() => void handleSendEmail(result.order.id)}>
                  Enviar por correo
                </Button>
              )}
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(result.message);
                  toast.success('Mensaje copiado');
                }}
              >
                Copiar mensaje
              </Button>
              <Button variant="ghost" onClick={() => router.push(`/orders/${result.order.id}`)}>
                Ver la orden
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Fetch the tenant name for the message template**

Add this hook call right after the `quickServices` SWR call near the top of the component:

```tsx
  const { data: tenant } = useApiSWR<{ name: string }>('/tenant/settings');
```

- [ ] **Step 3: Add the `handleSubmit` and `handleSendEmail` functions**

Add these right after `goBack()` (before the `return`):

```tsx
  async function handleSubmit() {
    if (signatureRef.current?.isEmpty()) {
      toast.error('Falta la firma del cliente');
      return;
    }
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      if (foundClient) {
        formData.append('clientId', foundClient.id);
      } else {
        formData.append(
          'newClient',
          JSON.stringify({ documentId, ...newClientForm }),
        );
      }
      const usingExistingVehicle =
        !isNewVehicle && !!foundClient && foundClient.motorcycles.length > 0;
      if (usingExistingVehicle) {
        formData.append('motorcycleId', selectedMotorcycleId);
      } else {
        formData.append('newMotorcycle', JSON.stringify(newVehicleForm));
      }
      if (selectedQuickServiceIds.length) {
        formData.append('quickServiceIds', JSON.stringify(selectedQuickServiceIds));
      }
      formData.append('description', description);
      photos.forEach((file) => formData.append('photos', file));
      const signatureBlob = await signatureRef.current?.toBlob();
      if (signatureBlob) formData.append('signature', signatureBlob, 'signature.png');

      const order = await api.upload<Order>('/orders/intake', formData);
      const message = buildIntakeMessage({
        firstName: order.client?.firstName ?? '',
        orderNumber: order.orderNumber,
        pickupCode: order.pickupCode ?? '',
        tenantName: tenant?.name ?? '',
      });
      setResult({
        order,
        message,
        whatsappPhone: order.client?.phone ? order.client.phone.replace(/\D/g, '') : null,
      });
      setStep('done');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendEmail(orderId: string) {
    try {
      await api.post(`/orders/${orderId}/send-intake-message`);
      toast.success('Correo enviado');
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }
```

- [ ] **Step 4: Add the `buildIntakeMessage` helper function**

Add this function at the very end of the file (module scope, outside the component):

```tsx
function buildIntakeMessage(data: {
  firstName: string;
  orderNumber: number;
  pickupCode: string;
  tenantName: string;
}) {
  return [
    `Hola ${data.firstName}.`,
    'Hemos recibido correctamente tu vehículo en nuestro taller.',
    `📋 Número de Orden: ${data.orderNumber}`,
    `🔐 Clave de salida: ${data.pickupCode}`,
    'Esta clave será necesaria para retirar tu vehículo. Por favor, consérvala y no la compartas con terceros.',
    'Puedes utilizar el número de orden para realizar consultas sobre el estado de la reparación.',
    'Gracias por confiar en nosotros. Será un gusto atenderte.',
    `Equipo ${data.tenantName}`,
  ].join('\n');
}
```

- [ ] **Step 5: Verify it builds**

Run: `pnpm --filter @taller/web build`
Expected: no TypeScript/ESLint errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/orders/new/page.tsx"
git commit -m "Add photo, signature and confirmation steps to the order intake wizard"
```

---

### Task 16: Frontend — replace "Nueva orden" dialog with a link

**Files:**
- Modify: `apps/web/src/app/(app)/orders/page.tsx`

- [ ] **Step 1: Simplify the imports**

Replace the import block at the top of the file with:

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { OrderStatusBadge } from '@/components/shared/order-status-badge';
import { useApiSWR } from '@/hooks/use-api-swr';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@taller/shared';
import type { Order, PaginatedResult } from '@/lib/types';
```

- [ ] **Step 2: Replace the "Nueva orden" button**

Replace:
```tsx
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus /> Nueva orden
            </Button>
          </DialogTrigger>
          <DialogContent>
            <NewOrderForm
              onSuccess={(id) => {
                setOpen(false);
                mutate((k) => typeof k === 'string' && k.startsWith('/orders'));
                window.location.href = `/orders/${id}`;
              }}
            />
          </DialogContent>
        </Dialog>
```
with:
```tsx
        <Link href="/orders/new">
          <Button>
            <Plus /> Nueva orden
          </Button>
        </Link>
```

- [ ] **Step 3: Remove the now-unused `open` state**

Remove this line from `OrdersPage`:
```tsx
  const [open, setOpen] = React.useState(false);
```

- [ ] **Step 4: Delete the entire `NewOrderForm` function**

Delete the whole `function NewOrderForm({ onSuccess }: { onSuccess: (id: string) => void }) { ... }` block at the end of the file (everything from `function NewOrderForm` to its closing `}`).

- [ ] **Step 5: Verify it builds**

Run: `pnpm --filter @taller/web build`
Expected: no TypeScript/ESLint errors, no unused-import warnings.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/orders/page.tsx"
git commit -m "Replace new-order dialog with link to the intake wizard"
```

---

### Task 17: Frontend — delivery flow on order detail page

**Files:**
- Modify: `apps/web/src/app/(app)/orders/[id]/page.tsx`

- [ ] **Step 1: Filter `DELIVERED` out of the manual status selector**

In `StatusChanger`, change:
```tsx
          {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
```
to:
```tsx
          {Object.entries(ORDER_STATUS_LABELS)
            .filter(([value]) => value !== 'DELIVERED')
            .map(([value, label]) => (
```
(and close the added `.filter(...)` parenthesis correctly — the existing `<SelectItem>` block and its closing `))}` stay the same, just now chained after `.filter(...)`.)

- [ ] **Step 2: Add the `DeliverVehicleDialog` component**

Add this function after `InvoiceActions` (before `RecordPaymentForm`):

```tsx
function DeliverVehicleDialog({ orderId, onUpdated }: { orderId: string; onUpdated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [pickupCode, setPickupCode] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post(`/orders/${orderId}/deliver`, { pickupCode });
      toast.success('Vehículo entregado');
      setOpen(false);
      setPickupCode('');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Entregar vehículo</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Entregar vehículo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 py-4">
            <Label>Clave de retiro</Label>
            <Input
              required
              maxLength={6}
              value={pickupCode}
              onChange={(e) => setPickupCode(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || pickupCode.length !== 6}>
              {isSubmitting ? 'Verificando...' : 'Confirmar entrega'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Render the dialog when the order is ready for delivery**

In the "Acciones" `<CardContent>`, right after `<StatusChanger .../>`, add:

```tsx
            {order.status === 'READY_FOR_DELIVERY' && (
              <DeliverVehicleDialog orderId={order.id} onUpdated={() => mutate()} />
            )}
```

- [ ] **Step 4: Verify it builds**

Run: `pnpm --filter @taller/web build`
Expected: no TypeScript/ESLint errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/orders/[id]/page.tsx"
git commit -m "Add pickup-code-gated vehicle delivery flow to order detail page"
```

---

### Task 18: Frontend — nav label rename + optional photo category

**Files:**
- Modify: `apps/web/src/components/layout/nav-config.ts`
- Modify: `apps/api/src/orders/photos/photos.controller.ts`
- Modify: `apps/api/src/orders/photos/photos.service.ts`
- Modify: `apps/web/src/components/orders/photos-tab.tsx`

- [ ] **Step 1: Rename the nav label**

In `nav-config.ts`, change:
```ts
  { href: '/motorcycles', label: 'Bicimotos', icon: Bike, roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] },
```
to:
```ts
  { href: '/motorcycles', label: 'Vehículos', icon: Bike, roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] },
```

- [ ] **Step 2: Make `category` optional in the photos controller**

In `apps/api/src/orders/photos/photos.controller.ts`, change the `upload` method signature:
```ts
  upload(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
    @Body('category') category: PhotoCategory | undefined,
    @UploadedFile() file: Express.Multer.File,
  ) {
```

- [ ] **Step 3: Make `category` optional in the photos service**

In `apps/api/src/orders/photos/photos.service.ts`, change the `upload` method:
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
    return this.prisma.orderPhoto.create({
      data: { orderId, category: category || undefined, url },
    });
  }
```

- [ ] **Step 4: Make category selection optional in the frontend photos tab**

In `apps/web/src/components/orders/photos-tab.tsx`:

Change the state initializer:
```tsx
  const [category, setCategory] = React.useState<PhotoCategory | undefined>(undefined);
```

Change the `<Select>` placeholder (in `<SelectValue placeholder="..." />`) to `"Sin categoría (opcional)"`.

Change `handleFileChange` to only append category when set:
```tsx
      const formData = new FormData();
      formData.append('file', file);
      if (category) formData.append('category', category);
```

Change the badge rendering to handle the missing-category case:
```tsx
              <Badge variant="secondary" className="w-fit">
                {photo.category ? CATEGORY_LABELS[photo.category] : 'Sin categoría'}
              </Badge>
```

And update the `alt` prop of the `<Image>` above it similarly:
```tsx
                  alt={photo.category ? CATEGORY_LABELS[photo.category] : 'Foto de la orden'}
```

- [ ] **Step 5: Verify both apps build**

Run: `pnpm --filter @taller/api build && pnpm --filter @taller/web build`
Expected: no errors in either.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/layout/nav-config.ts apps/api/src/orders/photos apps/web/src/components/orders/photos-tab.tsx
git commit -m "Rename Bicimotos to Vehiculos and make photo category optional"
```

---

### Task 19: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full backend build + tests**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: both succeed with no errors.

- [ ] **Step 2: Full frontend build**

```bash
pnpm --filter @taller/web build
```
Expected: succeeds with no errors.

- [ ] **Step 3: Start both servers and smoke-test manually**

```bash
pnpm --filter @taller/api start:dev
pnpm --filter @taller/web dev
```

Manual checklist (do this in an actual browser, ideally with the browser's device toolbar set to a phone size):
- [ ] Log in as `recepcion@tallerdemo.com` / `Password123!`.
- [ ] Go to Configuración → Servicios rápidos, create 2–3 tags, reorder them, edit one, delete one.
- [ ] Go to Órdenes → Nueva orden. Search a cédula that doesn't exist yet (e.g. `999999999`); confirm the new-client mini-form appears.
- [ ] Complete the vehicle step choosing "Moto", fill brand/model, continue.
- [ ] On the motivo step, select 1–2 quick-service chips and type a description; continue.
- [ ] Add 2 photos from the photo grid; continue.
- [ ] Draw a signature; confirm "Confirmar y crear orden" is disabled until you draw something.
- [ ] Submit; confirm the confirmation screen shows an order number and a 6-digit pickup code, and that "Copiar mensaje" puts the templated text on the clipboard.
- [ ] Open the created order's detail page; confirm the client, vehicle, and reason (with the quick-service labels folded in) look right.
- [ ] Manually drive the order through statuses up to "Lista para entrega" (via the status selector) and confirm `DELIVERED` is not an option in that selector.
- [ ] Click "Entregar vehículo", try a wrong code (expect an error), then the correct code (expect the order to move to "Entregada").
- [ ] Repeat the intake flow once more but this time search a cédula that already exists (e.g. `1020304050` from the seed data) and confirm it autofills the client and lists their existing vehicle(s).

- [ ] **Step 4: Final commit (if the manual pass required any fixes)**

Only if Step 3 uncovered issues and you fixed them:
```bash
git add -A
git commit -m "Fix issues found during manual verification of order intake flow"
```
