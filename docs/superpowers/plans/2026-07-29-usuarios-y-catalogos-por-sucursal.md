# Usuarios Ampliados + Catálogos por Sucursal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the MANAGER role self-serve on their own branch — create/edit/deactivate staff (except Administrators) scoped to their own branch, and manage their own branch's Quick Services / Accessory Options catalogs — plus fill a UI gap (Users table has no Edit/Deactivate buttons today).

**Architecture:** Mirrors the exact patterns already established in Sucursales Fase 1: `QuickService`/`AccessoryOption` gain a required `branchId` via the same expand→backfill→contract migration sequence used for `Client`/`Motorcycle`/`Order`; `UsersService` gains role-aware branch-scoping logic (MANAGER sees/touches only users sharing a branch with them, never ADMIN users) using the existing `UserBranch` join table directly — no new `@CurrentBranch()` usage for Users, since "which users a MANAGER can manage" is about the ACTOR's own branch assignments, not a per-request selected branch header.

**Tech Stack:** NestJS + Prisma 7 + PostgreSQL (`apps/api`), Next.js 16 App Router + React (`apps/web`), pnpm workspace monorepo.

---

## Task 1: Backend — `branchId` (nullable) on `QuickService`/`AccessoryOption`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [x] **Step 1: Add nullable `branchId` to both models**

In `apps/api/prisma/schema.prisma`, change:

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
to:
```prisma
model QuickService {
  id        String   @id @default(uuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  branchId  String?
  branch    Branch?  @relation(fields: [branchId], references: [id], onDelete: Restrict)
  label     String
  position  Int      @default(0)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())

  @@unique([tenantId, label])
  @@index([tenantId])
  @@index([branchId])
  @@map("quick_services")
}
```

Do the identical change to `model AccessoryOption` (same fields, `@@map("accessory_options")`).

Add the two inverse relations to `model Branch`:
```prisma
  userBranches     UserBranch[]
  clients          Client[]
  motorcycles      Motorcycle[]
  orders           Order[]
  quickServices    QuickService[]
  accessoryOptions AccessoryOption[]
```
(replacing the existing 4-line relation block with this 6-line one — same location, right before `@@unique([tenantId, code])`).

- [x] **Step 2: Generate the migration**

```bash
cd apps/api
pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```
Inspect the output. It should be two `ALTER TABLE ... ADD COLUMN "branchId" TEXT;` plus two `CREATE INDEX` statements and two `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY` statements — nothing destructive (both columns nullable, unique constraints unchanged in this step). If it matches that shape, apply it:

```bash
pnpm exec prisma migrate dev --name quick_service_accessory_option_branch_id_nullable
```
(If `migrate dev`'s interactive prompt isn't available in this shell, use `prisma migrate diff` to write the SQL to a file, create the migration folder by hand under `apps/api/prisma/migrations/<timestamp>_quick_service_accessory_option_branch_id_nullable/migration.sql`, then run `pnpm exec prisma migrate deploy`.)

- [x] **Step 3: Regenerate the Prisma client and verify build**

```bash
pnpm exec prisma generate
pnpm --filter @taller/api build
```
Expected: build fails with new errors in `quick-services.service.ts`/`accessory-options.service.ts` (missing `branchId` isn't required yet, so these should NOT error — but `create` calls that don't set `branchId` will now produce a value with `branchId: null` implicitly, which is fine since it's nullable at this step). If there ARE new errors, they should only be about `Branch`'s relation type changes, not about `create()` calls (nullable fields don't require a value). Confirm no unexpected errors.

- [x] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "Add nullable branchId to QuickService and AccessoryOption"
```

---

## Task 2: Backend — backfill script for existing catalogs

**Files:**
- Create: `apps/api/prisma/backfill-catalog-branches.ts`

- [x] **Step 1: Write the backfill script**

Mirrors `apps/api/prisma/backfill-branches.ts`'s exact structure and style (same imports, same `PrismaPg` adapter setup, same per-tenant loop, same idempotency-by-postcondition check):

```ts
// apps/api/prisma/backfill-catalog-branches.ts
// One-off data migration: assigns every existing QuickService and AccessoryOption
// row to the tenant's "Principal" branch (created in Sucursales Fase 1's own
// backfill, or in registerTenant for tenants created since). New branches start
// with an empty catalog — each sucursal is expected to build its own list.
//
// Run once, after the nullable-branchId migration (Task 1) and before the
// not-null migration (Task 3): `pnpm --filter @taller/api exec tsx prisma/backfill-catalog-branches.ts`

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const tenants = await prisma.tenant.findMany();

  for (const tenant of tenants) {
    const unbackfilledQuickServices = await prisma.quickService.count({
      where: { tenantId: tenant.id, branchId: null },
    });
    const unbackfilledAccessoryOptions = await prisma.accessoryOption.count({
      where: { tenantId: tenant.id, branchId: null },
    });
    if (unbackfilledQuickServices === 0 && unbackfilledAccessoryOptions === 0) {
      console.log(`Tenant ${tenant.name} already fully backfilled, skipping.`);
      continue;
    }

    const principal = await prisma.branch.findFirst({
      where: { tenantId: tenant.id, code: '0001' },
    });
    if (!principal) {
      console.log(
        `Tenant ${tenant.name} has no "Principal" (code 0001) branch — skipping. ` +
          `Run this after Sucursales Fase 1's own backfill has created one.`,
      );
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const { count: quickServiceCount } = await tx.quickService.updateMany({
        where: { tenantId: tenant.id, branchId: null },
        data: { branchId: principal.id },
      });
      const { count: accessoryOptionCount } = await tx.accessoryOption.updateMany({
        where: { tenantId: tenant.id, branchId: null },
        data: { branchId: principal.id },
      });
      console.log(
        `  Backfilled branchId: ${quickServiceCount} quick services, ${accessoryOptionCount} accessory options`,
      );
    });
  }

  console.log('Done.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [x] **Step 2: Run it against the dev database**

```bash
pnpm --filter @taller/api exec tsx prisma/backfill-catalog-branches.ts
```
Expected output: one line per tenant showing counts backfilled (or "already fully backfilled" / "no Principal branch" for tenants with none).

- [x] **Step 3: Verify via psql or Prisma Studio**

```bash
docker exec sistema-taller-motos-postgres-1 psql -U postgres -d taller_motos -c "SELECT COUNT(*) FROM quick_services WHERE \"branchId\" IS NULL;"
docker exec sistema-taller-motos-postgres-1 psql -U postgres -d taller_motos -c "SELECT COUNT(*) FROM accessory_options WHERE \"branchId\" IS NULL;"
```
Expected: both return `0` (adjust the container/db name if different — check `docker ps` first).

- [x] **Step 4: Commit**

```bash
git add apps/api/prisma/backfill-catalog-branches.ts
git commit -m "Add backfill script assigning existing catalogs to Principal branch"
```

---

## Task 3: Backend — make `branchId` required on `QuickService`/`AccessoryOption`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [x] **Step 1: Make `branchId` required, update the unique constraint**

Change both models' `branchId`/`branch` fields from optional to required (`String?` → `String`, `Branch?` → `Branch`), and change:
```prisma
  @@unique([tenantId, label])
```
to:
```prisma
  @@unique([tenantId, branchId, label])
```
on both `QuickService` and `AccessoryOption`.

- [x] **Step 2: Generate and hand-inspect the migration**

```bash
pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

**This is the highest-risk step in this plan** — inspect the output carefully before applying. It should be:
```sql
ALTER TABLE "quick_services" DROP CONSTRAINT IF EXISTS "quick_services_tenantId_label_key";
ALTER TABLE "quick_services" ALTER COLUMN "branchId" SET NOT NULL;
CREATE UNIQUE INDEX "quick_services_tenantId_branchId_label_key" ON "quick_services"("tenantId", "branchId", "label");
-- (same three statements for accessory_options)
```
If Prisma instead generates anything involving `DROP COLUMN`/data loss, STOP and hand-write the migration SQL matching the shape above instead of applying what was generated — this is exactly the kind of unsafe auto-generated migration Sucursales Fase 1's Task 4 caught and hand-corrected. The `ALTER COLUMN ... SET NOT NULL` will fail loudly (not silently) if any row still has a null `branchId` — that's the safety net confirming Task 2's backfill actually ran.

Apply via `pnpm exec prisma migrate dev --name quick_service_accessory_option_branch_id_required` (or hand-create the migration folder + `prisma migrate deploy`, same fallback as Task 1 Step 2).

- [x] **Step 3: Regenerate client and verify build**

```bash
pnpm exec prisma generate
pnpm --filter @taller/api build
```
Expected: NEW errors in `quick-services.service.ts` (`create`'s `data: { tenantId, label: ... }` missing required `branchId`) and `accessory-options.service.ts` (same). These are fixed in Task 4/5 — confirm the errors are ONLY about missing `branchId` in these two files' `create` calls, nothing else.

- [x] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "Make branchId required on QuickService/AccessoryOption, scope uniqueness per branch"
```

---

## Task 4: Backend — `QuickServicesService`/`QuickServicesController` branch scoping

**Files:**
- Modify: `apps/api/src/quick-services/quick-services.service.ts`
- Modify: `apps/api/src/quick-services/quick-services.controller.ts`

- [x] **Step 1: Service changes**

In `apps/api/src/quick-services/quick-services.service.ts`, add a required `branchId: string` parameter (right after `tenantId`) to `findAll`, `create`, and `reorder`, and use it in every `where`/`data` clause that currently only has `tenantId`:

```ts
  async findAll(tenantId: string, branchId: string) {
    return this.prisma.quickService.findMany({
      where: { tenantId, branchId, isActive: true },
      orderBy: { position: 'asc' },
    });
  }

  async create(tenantId: string, branchId: string, dto: CreateQuickServiceDto) {
    const existing = await this.prisma.quickService.findFirst({
      where: { tenantId, branchId, label: dto.label },
    });
    if (existing) {
      throw new ConflictException('Ya existe una etiqueta con ese nombre');
    }
    const last = await this.prisma.quickService.findFirst({
      where: { tenantId, branchId },
      orderBy: { position: 'desc' },
    });
    return this.prisma.quickService.create({
      data: { tenantId, branchId, label: dto.label, position: (last?.position ?? -1) + 1 },
    });
  }
```

```ts
  async reorder(tenantId: string, branchId: string, dto: ReorderQuickServicesDto) {
    const owned = await this.prisma.quickService.findMany({
      where: { tenantId, branchId, id: { in: dto.orderedIds } },
      select: { id: true },
    });
    if (owned.length !== dto.orderedIds.length) {
      throw new NotFoundException('Alguna etiqueta no pertenece a esta sucursal');
    }
    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.quickService.update({
          where: { id },
          data: { position: index },
        }),
      ),
    );
    return this.findAll(tenantId, branchId);
  }
```

`update`'s duplicate-label check needs a small fix that ISN'T just "leave it untouched" — unlike Órdenes/Clientes/Vehículos, the new DB constraint here is `@@unique([tenantId, branchId, label])`, not `@@unique([tenantId, label])`, so two different branches are now explicitly allowed to each have their own "Cambio de aceite". If `update`'s duplicate check stays tenant-wide, renaming an item in Branch B to a label Branch A already uses would be wrongly rejected even though the database itself would allow it. Fix it using the branchId already on the row being edited (no new `@CurrentBranch()` plumbing needed — `assertExists` already fetches the row, just capture and reuse it):

```ts
  async update(tenantId: string, id: string, dto: UpdateQuickServiceDto) {
    const current = await this.assertExists(tenantId, id);
    if (dto.label) {
      const existing = await this.prisma.quickService.findFirst({
        where: { tenantId, branchId: current.branchId, label: dto.label, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException('Ya existe una etiqueta con ese nombre');
      }
    }
    return this.prisma.quickService.update({ where: { id }, data: dto });
  }
```

`assertExists`/`remove` themselves are left untouched (still tenant-only, no branch check) — same "Fase 1 only scopes creation/listing, not per-id access" boundary already accepted for Órdenes/Clientes/Vehículos (a `quickServiceId` is already opaque and tenant-scoped; deleting/reading one you already have the id for doesn't need branch re-validation — only the *cross-branch-uniqueness* implication of `update`'s own duplicate check needed fixing here, which is a data-integrity concern specific to this task's new composite constraint, not a general access-scoping one).

- [x] **Step 2: Controller changes**

In `apps/api/src/quick-services/quick-services.controller.ts`, add the import:
```ts
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
```

Add `@CurrentBranch() branchId: string` to `findAll`, `create`, and `reorder`, passing it through to the service calls in the right argument position (right after `tenantId`).

- [x] **Step 3: Verify build**

```bash
pnpm --filter @taller/api build
```
Expected: `quick-services.service.ts`/`quick-services.controller.ts` now compile clean. Remaining errors (if any) should be confined to `accessory-options.service.ts` (fixed in Task 5).

- [x] **Step 4: Commit**

```bash
git add apps/api/src/quick-services/quick-services.service.ts apps/api/src/quick-services/quick-services.controller.ts
git commit -m "Scope quick services listing, creation, and reordering by branch"
```

---

## Task 5: Backend — `AccessoryOptionsService`/`AccessoryOptionsController` branch scoping

**Files:**
- Modify: `apps/api/src/accessory-options/accessory-options.service.ts`
- Modify: `apps/api/src/accessory-options/accessory-options.controller.ts`

- [x] **Step 1: Service changes**

Identical change to Task 4 Step 1, applied to `AccessoryOptionsService` (`findAll`, `create`, `reorder` gain `branchId`, same code shape with `accessoryOption`/`AccessoryOption` in place of `quickService`/`QuickService`, and `'Algún accesorio no pertenece a esta sucursal'` in place of the quick-service message).

- [x] **Step 2: Controller changes**

Identical change to Task 4 Step 2, applied to `AccessoryOptionsController`.

- [x] **Step 3: Verify build**

```bash
pnpm --filter @taller/api build
```
Expected: **zero errors related to quick-services or accessory-options.** Any remaining errors should be unrelated (Users changes from Task 7/8, not yet done).

- [x] **Step 4: Commit**

```bash
git add apps/api/src/accessory-options/accessory-options.service.ts apps/api/src/accessory-options/accessory-options.controller.ts
git commit -m "Scope accessory options listing, creation, and reordering by branch"
```

---

## Task 6: Backend — scope intake's quick-service/accessory-option lookups by branch

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts`

- [x] **Step 1: Add `branchId` to the two lookups inside `intake`**

In `apps/api/src/orders/orders.service.ts`, inside the `intake` transaction, change:
```ts
      const quickServices = dto.quickServiceIds?.length
        ? await tx.quickService.findMany({
            where: { id: { in: dto.quickServiceIds }, tenantId },
          })
        : [];
```
to:
```ts
      const quickServices = dto.quickServiceIds?.length
        ? await tx.quickService.findMany({
            where: { id: { in: dto.quickServiceIds }, tenantId, branchId },
          })
        : [];
```
and the identical change for `accessoryOptions`' `tx.accessoryOption.findMany` call right below it.

This means a `quickServiceId`/`accessoryOptionId` from a different branch is silently excluded from the results (not an error) — `buildIntakeReason`/`buildAccessoriesText` just receive fewer labels than ids sent, which is acceptable since the frontend intake wizard only ever offers the current branch's own catalog to pick from in the first place (Task 4/5 already scope `GET /quick-services`/`GET /accessory-options` to the current branch).

- [x] **Step 2: Verify build and tests**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: build succeeds, all existing tests still pass (this change doesn't touch any tested code path directly, but confirms no regression).

- [x] **Step 3: Commit**

```bash
git add apps/api/src/orders/orders.service.ts
git commit -m "Scope intake's quick-service and accessory-option lookups by branch"
```

---

## Task 7: Backend — `UsersService` role/branch-scoping logic

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/dto/create-user.dto.ts`

- [x] **Step 1: Add `branchIds` to `CreateUserDto`, exclude it from `UpdateUserDto`**

In `apps/api/src/users/dto/create-user.dto.ts`, add (mirroring `AssignBranchesDto`'s exact validator style):
```ts
  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  branchIds?: string[];
```
(add `IsArray`, `IsOptional` (already imported), `IsUUID` to the existing `class-validator` import line).

**This new field must NOT flow into `UpdateUserDto`.** `apps/api/src/users/dto/update-user.dto.ts` currently does `PartialType(OmitType(CreateUserDto, ['password'] as const))` — omitting only `password`. If `branchIds` isn't also omitted here, `update()`'s `data: dto` (see Step 2 below) would pass it straight to `prisma.user.update()`, which has no `branchIds` column, crashing with an unhandled `PrismaClientValidationError` on any `PATCH /users/:id` request that happens to include it — the exact same crash class this task's `create()` fix addresses for `password`, reintroduced by this task's own new field. Branch reassignment already has its own dedicated ADMIN-only endpoint (`POST /users/:id/branches` → `assignBranches`), so there's no reason for the general update endpoint to accept it at all. Change `update-user.dto.ts` to:
```ts
// branchIds is excluded, not just password: branch reassignment is already its
// own dedicated ADMIN-only operation (POST /users/:id/branches -> assignBranches),
// and User has no branchIds column — passing it through to Prisma's update() would
// crash the same way the pre-existing password-in-create() bug did.
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'branchIds'] as const),
) {
```

- [x] **Step 2: Rewrite `UsersService`**

Replace the full contents of `apps/api/src/users/users.service.ts` with:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from '../generated/prisma/enums';

const SAFE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  avatarUrl: true,
  lastLoginAt: true,
  createdAt: true,
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, actorUserId: string, actorRole: Role) {
    if (actorRole === Role.MANAGER) {
      const managerBranchIds = await this.userBranchIds(actorUserId);
      return this.prisma.user.findMany({
        where: { tenantId, branches: { some: { branchId: { in: managerBranchIds } } } },
        select: SAFE_SELECT,
        orderBy: { createdAt: 'desc' },
      });
    }
    return this.prisma.user.findMany({
      where: { tenantId },
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: SAFE_SELECT,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  /** Same as findOne, but 404s (hides existence) if actorRole is MANAGER and the
   * target is an ADMIN or doesn't share a branch with the manager. Used by
   * update/remove before mutating. */
  private async findOneScoped(
    tenantId: string,
    actorUserId: string,
    actorRole: Role,
    id: string,
  ) {
    const target = await this.findOne(tenantId, id);
    if (actorRole === Role.MANAGER) {
      if (target.role === Role.ADMIN) {
        throw new NotFoundException('Usuario no encontrado');
      }
      const [managerBranchIds, targetBranchIds] = await Promise.all([
        this.userBranchIds(actorUserId),
        this.userBranchIds(id),
      ]);
      const sharesBranch = targetBranchIds.some((b) => managerBranchIds.includes(b));
      if (!sharesBranch) throw new NotFoundException('Usuario no encontrado');
    }
    return target;
  }

  async findTechnicians(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, role: 'TECHNICIAN', isActive: true },
      select: SAFE_SELECT,
    });
  }

  async create(
    tenantId: string,
    actorUserId: string,
    actorRole: Role,
    dto: CreateUserDto,
  ) {
    if (actorRole === Role.MANAGER && dto.role === Role.ADMIN) {
      throw new ForbiddenException('No puedes crear un usuario Administrador');
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Ese correo ya está registrado');

    let branchIds: string[] = [];
    if (dto.role !== Role.ADMIN) {
      if (actorRole === Role.MANAGER) {
        branchIds = await this.userBranchIds(actorUserId);
      } else {
        if (!dto.branchIds?.length) {
          throw new BadRequestException('Debes indicar al menos una sucursal');
        }
        const branches = await this.prisma.branch.findMany({
          where: { id: { in: dto.branchIds }, tenantId },
        });
        if (branches.length !== dto.branchIds.length) {
          throw new NotFoundException('Alguna sucursal no pertenece a este taller');
        }
        branchIds = dto.branchIds;
      }
    }

    const { password, branchIds: _ignoredBranchIds, ...rest } = dto;
    const passwordHash = await argon2.hash(password);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { ...rest, tenantId, passwordHash },
        select: SAFE_SELECT,
      });
      if (branchIds.length) {
        await tx.userBranch.createMany({
          data: branchIds.map((branchId) => ({ userId: user.id, branchId })),
        });
      }
      return user;
    });
  }

  async update(
    tenantId: string,
    actorUserId: string,
    actorRole: Role,
    id: string,
    dto: UpdateUserDto,
  ) {
    await this.findOneScoped(tenantId, actorUserId, actorRole, id);
    if (actorRole === Role.MANAGER && dto.role === Role.ADMIN) {
      throw new ForbiddenException('No puedes asignar el rol Administrador');
    }
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: SAFE_SELECT,
    });
  }

  async remove(tenantId: string, actorUserId: string, actorRole: Role, id: string) {
    await this.findOneScoped(tenantId, actorUserId, actorRole, id);
    // Users are never hard-deleted so historical order/audit references stay intact.
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: SAFE_SELECT,
    });
  }

  async findMyBranches(tenantId: string, userId: string, role: Role) {
    if (role === Role.ADMIN) {
      return this.prisma.branch.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
      });
    }
    const assignments = await this.prisma.userBranch.findMany({
      where: { userId, branch: { tenantId, isActive: true } },
      include: { branch: true },
    });
    return assignments.map((a) => a.branch);
  }

  async assignBranches(tenantId: string, userId: string, branchIds: string[]) {
    await this.findOne(tenantId, userId);
    const uniqueBranchIds = [...new Set(branchIds)];
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: uniqueBranchIds }, tenantId },
    });
    if (branches.length !== uniqueBranchIds.length) {
      throw new NotFoundException('Alguna sucursal no pertenece a este taller');
    }
    await this.prisma.$transaction([
      this.prisma.userBranch.deleteMany({ where: { userId } }),
      this.prisma.userBranch.createMany({
        data: uniqueBranchIds.map((branchId) => ({ userId, branchId })),
      }),
    ]);
    return this.prisma.userBranch.findMany({
      where: { userId },
      include: { branch: true },
    });
  }

  async findUserBranches(tenantId: string, userId: string) {
    await this.findOne(tenantId, userId);
    return this.prisma.userBranch.findMany({
      where: { userId },
      include: { branch: true },
    });
  }

  private async userBranchIds(userId: string): Promise<string[]> {
    const assignments = await this.prisma.userBranch.findMany({
      where: { userId },
      select: { branchId: true },
    });
    return assignments.map((a) => a.branchId);
  }
}
```

Note: this both fixes the `create()` crash bug (destructuring `password`/`branchIds` out of `dto` before spreading `rest` into Prisma's `data`) AND adds all the new role/branch-scoping logic in one pass, since `create` needed a full rewrite anyway for the branch-assignment logic.

- [x] **Step 3: Verify build**

```bash
pnpm --filter @taller/api build
```
Expected: NEW errors in `users.controller.ts` (signature mismatches — `create`/`update`/`remove`/`findAll` now take extra parameters). Fixed in Task 8. Confirm errors are confined to that one file.

- [x] **Step 4: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/dto/create-user.dto.ts
git commit -m "Add MANAGER branch-scoped user management, fix create() password crash"
```

---

## Task 8: Backend — `UsersController` role gating + parameter wiring

**Files:**
- Modify: `apps/api/src/users/users.controller.ts`

- [x] **Step 1: Update role decorators and method signatures**

In `apps/api/src/users/users.controller.ts`:

`findAll`:
```ts
  @Roles(Role.ADMIN, Role.MANAGER)
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role,
  ) {
    return this.usersService.findAll(tenantId, userId, role);
  }
```

`create` — role decorator gains `MANAGER`:
```ts
  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('User')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(tenantId, userId, role, dto);
  }
```

`update` — role decorator gains `MANAGER`:
```ts
  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('User')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(tenantId, userId, role, id, dto);
  }
```

`remove` — role decorator gains `MANAGER`:
```ts
  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('User')
  @Delete(':id')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role,
    @Param('id') id: string,
  ) {
    return this.usersService.remove(tenantId, userId, role, id);
  }
```

`findOne`, `findTechnicians`, `findMyBranches`, `assignBranches`, `getUserBranches` are unchanged (no role decorator changes, no signature changes).

- [x] **Step 2: Verify build**

```bash
pnpm --filter @taller/api build
```
Expected: **zero errors.** This is the task that clears every remaining error from Tasks 1-7.

- [x] **Step 3: Commit**

```bash
git add apps/api/src/users/users.controller.ts
git commit -m "Let MANAGER create, edit, and deactivate users within their own branch scope"
```

---

## Task 9: Backend — unit tests for `UsersService` scoping logic

**Files:**
- Create: `apps/api/src/users/users.service.spec.ts`

- [x] **Step 1: Write the test file**

Following the exact same direct-instantiation-with-stubs pattern used in `apps/api/src/orders/orders.service.reactivate-client.spec.ts` and `apps/api/src/common/guards/branch-context.guard.spec.ts` (this codebase has no `TestingModule` usage anywhere — plain Jest units with a stub `PrismaService`):

```ts
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { Role } from '../generated/prisma/enums';

function makeService(prisma: Record<string, unknown>): UsersService {
  return new UsersService(prisma as never);
}

describe('UsersService — role/branch scoping', () => {
  const tenantId = 'tenant-1';
  const adminId = 'admin-1';
  const managerId = 'manager-1';
  const branchA = 'branch-a';
  const branchB = 'branch-b';

  describe('findAll', () => {
    it('returns every tenant user for ADMIN, unfiltered', async () => {
      const findMany = jest.fn().mockResolvedValue([{ id: 'u1' }]);
      const service = makeService({ user: { findMany } });

      await service.findAll(tenantId, adminId, Role.ADMIN);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } }),
      );
    });

    it('filters to users sharing a branch with the MANAGER', async () => {
      const findManyUserBranch = jest
        .fn()
        .mockResolvedValue([{ branchId: branchA }]);
      const findManyUser = jest.fn().mockResolvedValue([]);
      const service = makeService({
        userBranch: { findMany: findManyUserBranch },
        user: { findMany: findManyUser },
      });

      await service.findAll(tenantId, managerId, Role.MANAGER);

      expect(findManyUserBranch).toHaveBeenCalledWith({
        where: { userId: managerId },
        select: { branchId: true },
      });
      expect(findManyUser).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId,
            branches: { some: { branchId: { in: [branchA] } } },
          },
        }),
      );
    });
  });

  describe('create', () => {
    it('rejects a MANAGER trying to create an ADMIN', async () => {
      const service = makeService({});
      await expect(
        service.create(tenantId, managerId, Role.MANAGER, {
          role: Role.ADMIN,
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('auto-assigns the new user to the MANAGER\'s own branches, ignoring any branchIds in the dto', async () => {
      const findUnique = jest.fn().mockResolvedValue(null); // no email conflict
      const findManyUserBranch = jest.fn().mockResolvedValue([{ branchId: branchA }]);
      const tx = {
        user: { create: jest.fn().mockResolvedValue({ id: 'new-user' }) },
        userBranch: { createMany: jest.fn() },
      };
      const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(tx));
      const service = makeService({
        user: { findUnique },
        userBranch: { findMany: findManyUserBranch },
        $transaction,
      });

      await service.create(tenantId, managerId, Role.MANAGER, {
        email: 'a@b.com',
        password: 'password123',
        firstName: 'A',
        lastName: 'B',
        role: Role.RECEPTIONIST,
        branchIds: [branchB], // deliberately a DIFFERENT branch — must be ignored
      } as never);

      expect(tx.userBranch.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'new-user', branchId: branchA }],
      });
    });

    it('requires branchIds from an ADMIN creating a non-ADMIN user', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const service = makeService({ user: { findUnique } });

      await expect(
        service.create(tenantId, adminId, Role.ADMIN, {
          email: 'a@b.com',
          password: 'password123',
          firstName: 'A',
          lastName: 'B',
          role: Role.RECEPTIONIST,
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not crash on the raw password field (regression: Unknown argument `password`)', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const tx = {
        user: {
          create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
            expect(data).not.toHaveProperty('password');
            expect(data).toHaveProperty('passwordHash');
            return { id: 'new-admin' };
          }),
        },
        userBranch: { createMany: jest.fn() },
      };
      const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(tx));
      const service = makeService({ user: { findUnique }, $transaction });

      await service.create(tenantId, adminId, Role.ADMIN, {
        email: 'a@b.com',
        password: 'password123',
        firstName: 'A',
        lastName: 'B',
        role: Role.ADMIN,
      } as never);
    });
  });

  describe('update / remove — MANAGER scope', () => {
    it('404s (not 403s) when a MANAGER targets an ADMIN user, hiding its existence', async () => {
      const findFirst = jest.fn().mockResolvedValue({ id: 'target', role: Role.ADMIN });
      const service = makeService({ user: { findFirst } });

      await expect(
        service.update(tenantId, managerId, Role.MANAGER, 'target', {} as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('404s when the target does not share a branch with the MANAGER', async () => {
      const findFirst = jest.fn().mockResolvedValue({ id: 'target', role: Role.RECEPTIONIST });
      const findManyUserBranch = jest
        .fn()
        .mockResolvedValueOnce([{ branchId: branchA }]) // manager's branches
        .mockResolvedValueOnce([{ branchId: branchB }]); // target's branches — no overlap
      const service = makeService({
        user: { findFirst },
        userBranch: { findMany: findManyUserBranch },
      });

      await expect(
        service.update(tenantId, managerId, Role.MANAGER, 'target', {} as never),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a MANAGER trying to escalate a shared-branch user to ADMIN', async () => {
      const findFirst = jest.fn().mockResolvedValue({ id: 'target', role: Role.RECEPTIONIST });
      const findManyUserBranch = jest
        .fn()
        .mockResolvedValueOnce([{ branchId: branchA }])
        .mockResolvedValueOnce([{ branchId: branchA }]);
      const service = makeService({
        user: { findFirst },
        userBranch: { findMany: findManyUserBranch },
      });

      await expect(
        service.update(tenantId, managerId, Role.MANAGER, 'target', {
          role: Role.ADMIN,
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a MANAGER to update/deactivate a shared-branch, non-ADMIN user', async () => {
      const findFirst = jest.fn().mockResolvedValue({ id: 'target', role: Role.RECEPTIONIST });
      const findManyUserBranch = jest
        .fn()
        .mockResolvedValueOnce([{ branchId: branchA }])
        .mockResolvedValueOnce([{ branchId: branchA }]);
      const update = jest.fn().mockResolvedValue({ id: 'target', isActive: false });
      const service = makeService({
        user: { findFirst, update },
        userBranch: { findMany: findManyUserBranch },
      });

      await service.remove(tenantId, managerId, Role.MANAGER, 'target');

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'target' }, data: { isActive: false } }),
      );
    });
  });
});
```

- [x] **Step 2: Run the tests**

```bash
pnpm --filter @taller/api test -- users.service
```
Expected: all tests pass.

- [x] **Step 3: Verify full build/test/lint**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
pnpm --filter @taller/api lint
```
Expected: all clean. **Note:** `pnpm lint` runs with `--fix` and will reformat every file it touches — if it reformats files outside this task's scope, discard those specific unrelated reformattings via `git checkout -- <file>` before committing (this happened during Sucursales Fase 1's closing review; same care applies here).

- [x] **Step 4: Commit**

```bash
git add apps/api/src/users/users.service.spec.ts
git commit -m "Add unit tests for UsersService role/branch-scoping logic"
```

---

## Task 10: Frontend — nav + Settings tab gating for MANAGER

**Files:**
- Modify: `apps/web/src/components/layout/nav-config.ts`
- Modify: `apps/web/src/app/(app)/settings/page.tsx`

- [x] **Step 1: Allow MANAGER into the Settings nav item**

In `apps/web/src/components/layout/nav-config.ts`, change:
```ts
  { href: '/settings', label: 'Configuración', icon: Settings, roles: ['ADMIN'] },
```
to:
```ts
  { href: '/settings', label: 'Configuración', icon: Settings, roles: ['ADMIN', 'MANAGER'] },
```

- [x] **Step 2: Hide "General" and "Sucursales" tabs for MANAGER**

In `apps/web/src/app/(app)/settings/page.tsx`, add the import:
```ts
import { useAuth } from '@/components/providers/auth-provider';
```
(add to the existing import line — it currently only imports `getErrorMessage` from that module: `import { getErrorMessage } from '@/components/providers/auth-provider';` becomes `import { getErrorMessage, useAuth } from '@/components/providers/auth-provider';`).

Replace the `SettingsPage` component body:
```tsx
export default function SettingsPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">Datos del taller y gestión de usuarios</p>
      </div>
      <Tabs defaultValue={isManager ? 'users' : 'general'}>
        <TabsList>
          {!isManager && <TabsTrigger value="general">General</TabsTrigger>}
          <TabsTrigger value="users">Usuarios</TabsTrigger>
          <TabsTrigger value="quick-services">Servicios rápidos</TabsTrigger>
          <TabsTrigger value="accessories">Accesorios</TabsTrigger>
          {!isManager && <TabsTrigger value="branches">Sucursales</TabsTrigger>}
        </TabsList>
        {!isManager && (
          <TabsContent value="general">
            <GeneralSettings />
          </TabsContent>
        )}
        <TabsContent value="users">
          <UsersSettings />
        </TabsContent>
        <TabsContent value="quick-services">
          <QuickServicesSettings />
        </TabsContent>
        <TabsContent value="accessories">
          <AccessoryOptionsSettings />
        </TabsContent>
        {!isManager && (
          <TabsContent value="branches">
            <BranchesSettings />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
```

- [x] **Step 3: Verify build**

```bash
pnpm --filter @taller/web build
```
Expected: succeeds with no new errors (there will still be pre-existing unrelated errors if Task 11 hasn't landed yet — actually there shouldn't be any at this point, since Task 11 is additive UI, not a breaking type change. Confirm zero errors).

- [x] **Step 4: Commit**

```bash
git add apps/web/src/components/layout/nav-config.ts "apps/web/src/app/(app)/settings/page.tsx"
git commit -m "Give MANAGER access to Settings, limited to Usuarios/Servicios/Accesorios"
```

---

## Task 11: Frontend — Users: Edit/Deactivate UI + branch selection at creation

**Files:**
- Modify: `apps/web/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Rewrite `UsersSettings`**

Read the current `UsersSettings`/`NewUserForm` functions in full first (already shown above in this plan's context) — replace both, and add a new `EditUserForm`, as follows.

Replace `UsersSettings`:
```tsx
function UsersSettings() {
  const { user: currentUser } = useAuth();
  const { data: users, mutate } = useApiSWR<UserSummary[]>('/users');
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<UserSummary | null>(null);

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
              <Plus /> Nuevo usuario
            </Button>
          </DialogTrigger>
          <DialogContent>
            {editing ? (
              <EditUserForm
                user={editing}
                currentUserRole={currentUser!.role}
                onSuccess={() => {
                  setOpen(false);
                  setEditing(null);
                  mutate();
                }}
              />
            ) : (
              <NewUserForm
                currentUserRole={currentUser!.role}
                onSuccess={() => {
                  setOpen(false);
                  mutate();
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Correo</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Sucursales</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users?.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">
                {u.firstName} {u.lastName}
              </TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                <Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={u.isActive ? 'success' : 'destructive'}>
                  {u.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
              </TableCell>
              <TableCell>
                {currentUser?.role === 'ADMIN' && (
                  <AssignBranchesButton user={u} onAssigned={() => mutate()} />
                )}
              </TableCell>
              <TableCell>
                {!(currentUser?.role === 'MANAGER' && u.role === 'ADMIN') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(u);
                      setOpen(true);
                    }}
                  >
                    Editar
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `NewUserForm`**

```tsx
function NewUserForm({
  currentUserRole,
  onSuccess,
}: {
  currentUserRole: Role;
  onSuccess: () => void;
}) {
  const [form, setForm] = React.useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    role: Role.RECEPTIONIST as Role,
  });
  const [branchIds, setBranchIds] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const needsBranchPicker = currentUserRole === 'ADMIN' && form.role !== 'ADMIN';
  const { data: branches } = useApiSWR<Branch[]>(needsBranchPicker ? '/branches' : null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/users', {
        ...form,
        ...(needsBranchPicker ? { branchIds } : {}),
      });
      toast.success('Usuario creado');
      onSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const roleOptions = Object.entries(ROLE_LABELS).filter(
    ([value]) => value !== 'CLIENT' && (currentUserRole === 'ADMIN' || value !== 'ADMIN'),
  );

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Nuevo usuario</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3 py-4">
        <div className="flex flex-col gap-1.5">
          <Label>Nombre</Label>
          <Input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Apellido</Label>
          <Input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Correo</Label>
          <Input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Contraseña</Label>
          <Input
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Rol</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {needsBranchPicker && (
          <div className="col-span-2 flex flex-col gap-2">
            <Label>Sucursales</Label>
            {branches?.map((branch) => (
              <Label key={branch.id} className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={branchIds.includes(branch.id)}
                  onCheckedChange={(checked) =>
                    setBranchIds((prev) =>
                      checked === true
                        ? [...prev, branch.id]
                        : prev.filter((id) => id !== branch.id),
                    )
                  }
                />
                {branch.name} ({branch.code})
              </Label>
            ))}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button
          type="submit"
          disabled={isSubmitting || (needsBranchPicker && branchIds.length === 0)}
        >
          {isSubmitting ? 'Guardando...' : 'Crear usuario'}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 3: Add `EditUserForm`**

Add this new function right after `NewUserForm`:

```tsx
function EditUserForm({
  user,
  currentUserRole,
  onSuccess,
}: {
  user: UserSummary;
  currentUserRole: Role;
  onSuccess: () => void;
}) {
  const [form, setForm] = React.useState({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? '',
    role: user.role,
    isActive: user.isActive,
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.patch(`/users/${user.id}`, form);
      toast.success('Usuario actualizado');
      onSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const roleOptions = Object.entries(ROLE_LABELS).filter(
    ([value]) => value !== 'CLIENT' && (currentUserRole === 'ADMIN' || value !== 'ADMIN'),
  );

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Editar usuario</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3 py-4">
        <div className="flex flex-col gap-1.5">
          <Label>Nombre</Label>
          <Input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Apellido</Label>
          <Input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Teléfono</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Rol</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={form.isActive}
              onCheckedChange={(checked) => setForm({ ...form, isActive: checked === true })}
            />
            Usuario activo
          </Label>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Guardar'}
        </Button>
      </DialogFooter>
    </form>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
pnpm --filter @taller/web build
```
Expected: **zero errors.**

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/settings/page.tsx"
git commit -m "Add Edit/Deactivate UI for users, branch selection at creation time"
```

---

## Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full backend build + tests**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: both succeed with no errors, all test suites passing (including the two new ones from this plan).

- [ ] **Step 2: Full frontend build**

```bash
pnpm --filter @taller/web build
```
Expected: succeeds with no errors.

- [ ] **Step 3: Manual smoke test**

With both dev servers running:
- [ ] Log in as `admin@tallerdemo.com`. Confirm "Configuración" still shows all 5 tabs (General, Usuarios, Servicios rápidos, Accesorios, Sucursales).
- [ ] Create a new user with role Recepción — confirm it now succeeds (the original crash is fixed) and that a branch-selection checkbox list appears and is required.
- [ ] Edit that user (change phone, toggle Inactivo) — confirm it saves.
- [ ] Go to Servicios rápidos / Accesorios while "Principal" is selected — confirm the existing items are still there (backfilled correctly). Switch to a second branch (create one if needed) — confirm the list is empty there, and adding one there doesn't appear back in Principal.
- [ ] Create (or use existing) a MANAGER user assigned to one branch. Log in as them — confirm "Configuración" appears in the nav with only 3 tabs (Usuarios, Servicios rápidos, Accesorios — no General, no Sucursales).
- [ ] As that MANAGER, create a new user — confirm no branch selector appears (auto-assigned), confirm "Administrador" is not offered as a role option, confirm the created user only appears in their own branch's user list, not in the ADMIN's Sucursal Norte view (if they belong to a different branch).
- [ ] As that MANAGER, confirm the user list only shows people sharing their branch (not the full tenant roster), and that there's no "Editar" button rendered for any Administrador row (if one happens to be visible via a shared UserBranch edge case).

- [ ] **Step 4: Final commit (only if the manual pass required fixes)**

```bash
git add -A
git commit -m "Fix issues found during manual verification of expanded user management"
```
