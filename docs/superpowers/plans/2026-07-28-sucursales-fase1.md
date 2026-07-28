# Sucursales Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `Branch` (sucursal) entity with user assignment and a branch-switcher UI, and apply it to the three entities of the vehicle-intake flow (`Client`, `Motorcycle`, `Order`), including the new branch-code-prefixed order numbering scheme (`<código sucursal><secuencia 4 dígitos>`, e.g. `20560001`).

**Architecture:** New `Branch`/`UserBranch` Prisma models. A new `BranchContextGuard` + `@CurrentBranch()` decorator (mirroring the existing `JwtAuthGuard`/`@CurrentUser()` pattern) resolves and validates the caller's selected branch from an `X-Branch-Id` header on every request. Existing services (`OrdersService`, `ClientsService`, `MotorcyclesService`) add `branchId` scoping alongside their existing `tenantId` scoping. The frontend persists the selected branch in `localStorage` (mirroring how the access token is persisted) and attaches it as a header on every API call, with a switcher in the topbar.

**Tech Stack:** NestJS + Prisma 7 (backend), Next.js 16 App Router (frontend) — mirrors the existing `AccessoryOption`/`QuickService` catalog-module pattern for the new `BranchesModule`, and the existing `@CurrentUser()`/`JwtAuthGuard` pattern for the new branch-context mechanism.

**⚠️ Data migration risk:** `Order.orderNumber` changes type from `Int` to `String`, and every existing `Client`/`Motorcycle`/`Order` row needs a `branchId` backfilled to a newly-created "Principal" branch. This plan uses an **expand → backfill → contract** sequence (add nullable columns → run a data script → make them required) specifically to avoid Prisma's non-interactive migration engine silently doing a destructive `DROP COLUMN`+`ADD COLUMN` instead of a safe rename when changing `orderNumber`'s type. Follow Task 4's steps exactly, including the manual SQL edit — do not skip the `--create-only` inspection step.

---

## Task 1: Prisma schema — `Branch` + `UserBranch` models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the two new models**

Add after `model AccessoryOption` (search for it, currently ends around line 228, right before `model User`):

```prisma
model Branch {
  id              String   @id @default(uuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name            String
  code            String
  address         String?
  city            String?
  phone           String?
  email           String?
  isActive        Boolean  @default(true)
  nextOrderNumber Int      @default(1)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  userBranches UserBranch[]

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

- [ ] **Step 2: Add inverse relations**

In `model Tenant` (search for it), add right after `notifications      Notification[]`:
```prisma
  branches           Branch[]
```

In `model User` (search for it), add right after `notificationsSent     Notification[] @relation("NotificationSentBy")`:
```prisma
  branches             UserBranch[]
```

- [ ] **Step 3: Generate and run the migration**

```bash
pnpm --filter @taller/api exec prisma migrate dev --name branches
```

Expected: migration succeeds, creates `branches` and `user_branches` tables (both empty, no data impact — this migration touches no existing table).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "Add Branch and UserBranch models"
```

---

## Task 2: Prisma schema — add nullable `branchId` to Client/Motorcycle/Order

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

This step is purely additive and safe on existing data — `branchId` is added as **optional** here. Task 3 backfills it; Task 4 makes it required.

- [ ] **Step 1: Add `branchId` (nullable) to the three models**

In `model Client` (search for it), add right after `tenant     Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)`:
```prisma
  branchId   String?
  branch     Branch?   @relation(fields: [branchId], references: [id], onDelete: Restrict)
```

In `model Motorcycle`, add right after `tenant           Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)`:
```prisma
  branchId         String?
  branch           Branch?   @relation(fields: [branchId], references: [id], onDelete: Restrict)
```

In `model Order`, add right after `tenant               Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)`:
```prisma
  branchId             String?
  branch               Branch?     @relation(fields: [branchId], references: [id], onDelete: Restrict)
```

- [ ] **Step 2: Add inverse relations on `Branch`**

In `model Branch` (added in Task 1), add after `userBranches UserBranch[]`:
```prisma
  clients      Client[]
  motorcycles  Motorcycle[]
  orders       Order[]
```

- [ ] **Step 3: Add indexes**

Add `@@index([branchId])` to `Client`, `Motorcycle`, and `Order` (alongside their existing `@@index([tenantId])` — do not remove the existing tenant index, add this as an additional one).

- [ ] **Step 4: Generate and run the migration**

```bash
pnpm --filter @taller/api exec prisma migrate dev --name client_motorcycle_order_branch_id_nullable
```

Expected: succeeds — adds three nullable columns, no data loss possible (nullable columns default to `NULL` on existing rows).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "Add nullable branchId to Client, Motorcycle, Order"
```

---

## Task 3: Data backfill script — create Principal branch, backfill existing rows

**Files:**
- Create: `apps/api/prisma/backfill-branches.ts`

- [x] **Step 1: Write the script**

```ts
// apps/api/prisma/backfill-branches.ts
// One-off data migration: creates a "Principal" branch per tenant and backfills
// branchId on all existing Client/Motorcycle/Order rows. Also computes each new
// Branch's nextOrderNumber so future orders continue the old numeric sequence
// without colliding with the values this script assigns below.
//
// Run once, after the nullable-branchId migration (Task 2) and before the
// not-null migration (Task 4): `pnpm --filter @taller/api exec tsx prisma/backfill-branches.ts`

import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany();

  for (const tenant of tenants) {
    const existingBranch = await prisma.branch.findFirst({
      where: { tenantId: tenant.id },
    });
    if (existingBranch) {
      console.log(`Tenant ${tenant.name} already has a branch, skipping.`);
      continue;
    }

    const orders = await prisma.order.findMany({
      where: { tenantId: tenant.id },
      select: { orderNumber: true },
    });
    const maxOrderNumber = orders.reduce(
      (max, o) => Math.max(max, Number(o.orderNumber)),
      0,
    );

    const branch = await prisma.branch.create({
      data: {
        tenantId: tenant.id,
        name: 'Principal',
        code: '0001',
        address: tenant.address,
        phone: tenant.phone,
        email: tenant.email,
        nextOrderNumber: maxOrderNumber + 1,
      },
    });
    console.log(`Created branch "Principal" (0001) for tenant ${tenant.name}`);

    const { count: clientCount } = await prisma.client.updateMany({
      where: { tenantId: tenant.id },
      data: { branchId: branch.id },
    });
    const { count: motorcycleCount } = await prisma.motorcycle.updateMany({
      where: { tenantId: tenant.id },
      data: { branchId: branch.id },
    });
    const { count: orderCount } = await prisma.order.updateMany({
      where: { tenantId: tenant.id },
      data: { branchId: branch.id },
    });
    console.log(
      `  Backfilled branchId: ${clientCount} clients, ${motorcycleCount} motorcycles, ${orderCount} orders`,
    );

    // Reformat existing order numbers into the new "<code><4-digit sequence>" scheme.
    const allOrders = await prisma.order.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, orderNumber: true },
    });
    for (const order of allOrders) {
      const sequence = String(order.orderNumber).padStart(4, '0');
      await prisma.order.update({
        where: { id: order.id },
        data: { orderNumberText: `${branch.code}${sequence}` },
      });
    }
    console.log(`  Reformatted ${allOrders.length} order numbers`);
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

Note: this script writes to a field named `orderNumberText`, which does not exist yet — that's intentional and added in the next step, since we need a temporary parallel column to hold the reformatted value before safely replacing the original `orderNumber` column in Task 4 (see the plan header's note on why this expand/backfill/contract sequence is used).

- [x] **Step 2: Add the temporary `orderNumberText` column**

Add to `model Order` in `apps/api/prisma/schema.prisma`, right after `orderNumber          Int`:
```prisma
  orderNumberText      String?
```

```bash
pnpm --filter @taller/api exec prisma migrate dev --name order_number_text_temp
```

- [x] **Step 3: Run the backfill script**

```bash
pnpm --filter @taller/api exec tsx prisma/backfill-branches.ts
```

Expected output: one "Created branch..." + "Backfilled..." + "Reformatted..." block per tenant, ending in "Done."

- [x] **Step 4: Verify the backfill**

Run a quick manual check via Prisma Studio or a one-off query — confirm every `Client`/`Motorcycle`/`Order` row now has a non-null `branchId`, and every `Order.orderNumberText` looks like `00010001`, `00010002`, etc.

```bash
pnpm --filter @taller/api exec prisma studio
```
(Check the `orders`, `clients`, `motorcycles`, and `branches` tables, then stop the process — this is a manual verification step, not something to leave running.)

- [x] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/prisma/backfill-branches.ts
git commit -m "Add data-backfill script for branches, run it against dev data"
```

**Post-review fix (commit `c8e7ff1`):** code review found the skip-check was keyed on "does a branch exist for this tenant" rather than "did the backfill actually finish" — the exact gap that let the first run's crash (a stale generated Prisma client after Task 2's schema change, before `prisma generate` had been re-run) leave a dangling partial `Branch` row that a naive re-run would have silently treated as "already done," permanently leaving that tenant's data un-backfilled. Fixed by wrapping each tenant's work in a `$transaction` (a crash now rolls back cleanly, so no partial branch can survive) and keying the skip-check on the real postcondition (zero rows left with a null `branchId`/`orderNumberText`). Verified by actually re-running the script against the already-backfilled dev data — it correctly no-oped with no duplicate branch and no data change. See the actual committed code, not the snippet above, as the source of truth for this task.

---

## Task 4: Prisma schema — make `branchId` required, replace `orderNumber` with the reformatted text column

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

This is the most delicate step in the plan — read the whole task before running anything.

- [x] **Step 1: Back up the database first**

This task rewrites a column's data (`Order.orderNumber`) via schema migration. Before touching anything, take a dump so this is trivially reversible if something goes wrong:
```bash
docker exec sistema-taller-motos-postgres-1 pg_dump -U postgres -d taller_motos > "../../backup-before-branch-migration-$(date +%Y%m%d%H%M%S).sql"
```
(Adjust the container name/database name/user if they differ from what `docker ps` and `apps/api/.env`'s `DATABASE_URL` show — confirm before running. Save the dump path somewhere you'll remember; you won't need it if everything goes well, but don't skip creating it.)

- [x] **Step 2: Update the schema**

In `model Client`, change:
```prisma
  branchId   String?
  branch     Branch?   @relation(fields: [branchId], references: [id], onDelete: Restrict)
```
to:
```prisma
  branchId   String
  branch     Branch    @relation(fields: [branchId], references: [id], onDelete: Restrict)
```

Do the same (drop the `?`) for `Motorcycle.branchId`/`Motorcycle.branch` and `Order.branchId`/`Order.branch`.

In `model Order`: remove the old `orderNumber          Int` field and its `@@unique([tenantId, orderNumber])` constraint entirely. Rename `orderNumberText      String?` to `orderNumber          String` (required, not optional — the backfill script already populated every row). Re-add the unique constraint on the new field: `@@unique([tenantId, orderNumber])`.

The `Order` model's relevant lines should now read:
```prisma
model Order {
  id                   String      @id @default(uuid())
  tenantId             String
  tenant               Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  branchId             String
  branch               Branch      @relation(fields: [branchId], references: [id], onDelete: Restrict)
  orderNumber          String
  clientId             String
  client               Client      @relation(fields: [clientId], references: [id], onDelete: Restrict)
  motorcycleId         String
  motorcycle           Motorcycle  @relation(fields: [motorcycleId], references: [id], onDelete: Restrict)
  receptionistId       String
  receptionist         User        @relation("receptionist", fields: [receptionistId], references: [id], onDelete: Restrict)
  ... (all other existing fields unchanged) ...

  @@unique([tenantId, orderNumber])
  @@index([tenantId, status])
  @@index([branchId])
  @@map("orders")
}
```
(Keep every other existing field/relation/index on `Order` exactly as it already is — only `orderNumber`'s type/position and the `branchId`/`branch` nullability change in this task.)

- [x] **Step 3: Generate the migration WITHOUT applying it**

```bash
pnpm --filter @taller/api exec prisma migrate dev --create-only --name branch_id_required_order_number_text
```

**What actually happened:** `migrate dev --create-only` requires an interactive TTY for its data-loss confirmation prompt, which wasn't available — used `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` instead to see what Prisma would generate, without applying anything.

- [x] **Step 4: Inspect and, if necessary, fix the generated SQL**

Open the new file at `apps/api/prisma/migrations/<timestamp>_branch_id_required_order_number_text/migration.sql`. It needs to:
1. Drop the old `orderNumber` (Int) column and its unique index.
2. Rename `orderNumberText` to `orderNumber` **preserving data** — this must be `ALTER TABLE "orders" RENAME COLUMN "orderNumberText" TO "orderNumber";`, NOT a drop-and-recreate. Prisma's migration diff engine sometimes generates a rename correctly on its own when it can detect one column removed + one added of a compatible shape in the same table, but verify this explicitly — if the generated SQL instead does `ALTER TABLE "orders" DROP COLUMN "orderNumberText"` and `ALTER TABLE "orders" ADD COLUMN "orderNumber" TEXT NOT NULL` as separate statements (which would lose the backfilled data), replace those two statements with the single `RENAME COLUMN` statement above instead.
3. Set the renamed `orderNumber` column `NOT NULL` (it should already be, since the backfill in Task 3 populated every row).
4. Re-create the `@@unique([tenantId, orderNumber])` index under its new column.
5. Make `branchId` `NOT NULL` on `clients`, `motorcycles`, `orders` (three separate `ALTER COLUMN ... SET NOT NULL` statements, or however Prisma expresses it — should be safe as-is since Task 3 already backfilled every row).

If you had to hand-edit the SQL, re-verify the whole file reads sensibly top to bottom before applying.

**Real finding (not hypothetical):** the raw diff Prisma generated for this exact schema change WAS the unsafe kind described above — `DROP COLUMN "orderNumberText"` + `ALTER COLUMN "orderNumber" SET DATA TYPE TEXT`, which would have kept the OLD Int-derived values (cast to text) and silently discarded the entire backfilled column. The committed migration was hand-corrected to `DROP COLUMN "orderNumber"` (the old Int one) → `RENAME COLUMN "orderNumberText" TO "orderNumber"` instead. This was independently re-verified via direct database queries (not just re-reading the SQL) before being accepted.

- [x] **Step 5: Apply the migration**

```bash
pnpm --filter @taller/api exec prisma migrate dev
```
(No `--create-only` this time — this applies the migration file from Steps 3/4.)

Expected: succeeds with no data loss. Verify via `prisma studio` again that `orders.orderNumber` still shows values like `00010001` (not null, not reset) and `branchId` is populated on every row across all three tables.

**What actually happened:** applied via `prisma migrate deploy` instead of `migrate dev` (same non-interactive-shell reason as Step 3). Verified directly against the database (not just via Studio): all 9 orders show `00010001`–`00010009`, `branchId` is `NOT NULL` and populated on all rows of `clients`/`motorcycles`/`orders`, and the `@@unique([tenantId, orderNumber])` constraint exists as a real index.

- [x] **Step 6: Regenerate the Prisma client explicitly**

A prior task in this repo found that `prisma migrate dev` doesn't always auto-regenerate the client — run this explicitly and confirm:
```bash
pnpm --filter @taller/api exec prisma generate
```

- [x] **Step 7: Verify backend build**

```bash
pnpm --filter @taller/api build
```
Expected: **this will FAIL** at this point — `OrdersService` still writes `orderNumber: tenant.nextOrderNumber - 1` (a number) into a field that's now typed `String`, and doesn't set `branchId` anywhere. That's expected and fixed in Task 8. Confirm the build fails specifically due to `orderNumber`/`branchId` type errors in `orders.service.ts` (not some other unrelated error) — if it fails for a different reason, stop and report it.

**What actually happened:** build failed with 23 errors, broader than just `orders.service.ts` (also `clients.service.ts`, `motorcycles.service.ts`, `quotations.service.ts`, `notification-inbox.service.ts`, and the now-obsolete `prisma/backfill-branches.ts`/`prisma/seed.ts` scripts) — every one independently confirmed to be a direct, mechanical consequence of the `branchId`-now-required / `orderNumber`-now-`string` changes, not unrelated breakage. Fixed across Tasks 8-11.

- [x] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "Make branchId required; replace Order.orderNumber with the branch-prefixed text field"
```

Note in the commit message or a plan comment that `pnpm build` is expected to fail until Task 8 lands — this is a deliberately incremental sequence, not a broken commit to be alarmed about.

**Follow-up noted for later (not part of this task):** code review flagged that `Tenant.nextOrderNumber` will become fully orphaned once Task 8 stops using it in favor of `Branch.nextOrderNumber`, but no task in this plan removes the now-dead column. Worth a small cleanup task after Task 8 lands, or an explicit decision to keep it for a rollback path — flagging here so it isn't lost.

---

## Task 5: Backend — `BranchContextGuard` + `@CurrentBranch()` decorator

**Files:**
- Create: `apps/api/src/common/decorators/current-branch.decorator.ts`
- Create: `apps/api/src/common/guards/branch-context.guard.ts`
- Modify: `apps/api/src/app.module.ts`

- [x] **Step 1: The decorator**

```ts
// apps/api/src/common/decorators/current-branch.decorator.ts
import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RequestWithUser } from './current-user.decorator';

export type RequestWithBranch = RequestWithUser & { branchId?: string };

/** Throws if no valid X-Branch-Id header was resolved by BranchContextGuard. */
export const CurrentBranch = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<RequestWithBranch>();
    if (!request.branchId) {
      throw new BadRequestException('Sucursal no especificada');
    }
    return request.branchId;
  },
);
```

- [x] **Step 2: The guard**

```ts
// apps/api/src/common/guards/branch-context.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '../../generated/prisma/enums';
import type { RequestWithBranch } from '../decorators/current-branch.decorator';

/**
 * Runs after JwtAuthGuard. If the request carries an X-Branch-Id header, validates
 * that the branch belongs to the caller's tenant and that the caller may access it
 * (ADMIN can access every branch in their tenant automatically; any other role must
 * have an explicit UserBranch row), then attaches the validated id to the request.
 * Does NOT reject requests with no header — individual endpoints that require a
 * branch use `@CurrentBranch()`, which throws on its own if nothing was resolved here.
 */
@Injectable()
export class BranchContextGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithBranch>();
    const headerBranchId = request.headers['x-branch-id'];
    const branchId = Array.isArray(headerBranchId) ? headerBranchId[0] : headerBranchId;
    if (!branchId || !request.user) return true;

    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId: request.user.tenantId },
    });
    if (!branch) throw new ForbiddenException('Sucursal no encontrada');

    if (request.user.role !== Role.ADMIN) {
      const access = await this.prisma.userBranch.findUnique({
        where: { userId_branchId: { userId: request.user.userId, branchId } },
      });
      if (!access) throw new ForbiddenException('No tienes acceso a esa sucursal');
    }

    request.branchId = branch.id;
    return true;
  }
}
```

- [x] **Step 3: Register globally, after `RolesGuard`**

In `apps/api/src/app.module.ts`, add the import:
```ts
import { BranchContextGuard } from './common/guards/branch-context.guard';
```

Add to the `providers` array, right after the `RolesGuard` entry:
```ts
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: BranchContextGuard },
```

- [x] **Step 4: Verify build**

```bash
pnpm --filter @taller/api build
```
Expected: still fails for the same `orders.service.ts` reasons as Task 4 — confirm no NEW errors were introduced by this task's files specifically.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/common/decorators/current-branch.decorator.ts apps/api/src/common/guards/branch-context.guard.ts apps/api/src/app.module.ts
git commit -m "Add BranchContextGuard and @CurrentBranch() decorator"
```

---

## Task 6: Backend — `BranchesModule` (CRUD)

**Files:**
- Create: `apps/api/src/branches/dto/create-branch.dto.ts`
- Create: `apps/api/src/branches/dto/update-branch.dto.ts`
- Create: `apps/api/src/branches/branches.service.ts`
- Create: `apps/api/src/branches/branches.controller.ts`
- Create: `apps/api/src/branches/branches.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [x] **Step 1: DTOs**

```ts
// apps/api/src/branches/dto/create-branch.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';

export class CreateBranchDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ example: '2056' })
  @IsString()
  @Matches(/^\d{4}$/, { message: 'El código debe tener exactamente 4 dígitos' })
  code: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;
}
```

```ts
// apps/api/src/branches/dto/update-branch.dto.ts
import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateBranchDto } from './create-branch.dto';

export class UpdateBranchDto extends PartialType(CreateBranchDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

- [x] **Step 2: Service**

```ts
// apps/api/src/branches/branches.service.ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async create(tenantId: string, dto: CreateBranchDto) {
    const existing = await this.prisma.branch.findFirst({
      where: { tenantId, code: dto.code },
    });
    if (existing) {
      throw new ConflictException('Ya existe una sucursal con ese código');
    }
    return this.prisma.branch.create({ data: { tenantId, ...dto } });
  }

  async update(tenantId: string, id: string, dto: UpdateBranchDto) {
    await this.assertExists(tenantId, id);
    if (dto.code) {
      const existing = await this.prisma.branch.findFirst({
        where: { tenantId, code: dto.code, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException('Ya existe una sucursal con ese código');
      }
    }
    return this.prisma.branch.update({ where: { id }, data: dto });
  }

  private async assertExists(tenantId: string, id: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id, tenantId } });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');
    return branch;
  }
}
```

- [x] **Step 3: Controller**

```ts
// apps/api/src/branches/branches.controller.ts
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('branches')
@Roles(Role.ADMIN)
@Controller('branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.branchesService.findAll(tenantId);
  }

  @Audit('Branch')
  @Post()
  create(@CurrentUser('tenantId') tenantId: string, @Body() dto: CreateBranchDto) {
    return this.branchesService.create(tenantId, dto);
  }

  @Audit('Branch')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branchesService.update(tenantId, id, dto);
  }
}
```

- [x] **Step 4: Module**

```ts
// apps/api/src/branches/branches.module.ts
import { Module } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { BranchesController } from './branches.controller';

@Module({
  controllers: [BranchesController],
  providers: [BranchesService],
  exports: [BranchesService],
})
export class BranchesModule {}
```

- [x] **Step 5: Register in `AppModule`**

Add the import and add `BranchesModule` to the `imports` array, right after `AccessoryOptionsModule,`:
```ts
import { BranchesModule } from './branches/branches.module';
```
```ts
    AccessoryOptionsModule,
    BranchesModule,
```

- [x] **Step 6: Verify build**

```bash
pnpm --filter @taller/api build
```
Expected: still fails for the pre-existing `orders.service.ts` reasons only — confirm no new errors from this task's files.

- [x] **Step 7: Commit**

```bash
git add apps/api/src/branches apps/api/src/app.module.ts
git commit -m "Add BranchesModule (list, create, update)"
```

---

## Task 7: Backend — `GET /users/me/branches` + user-branch assignment

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.controller.ts`
- Create: `apps/api/src/users/dto/assign-branches.dto.ts`

- [x] **Step 1: DTO**

```ts
// apps/api/src/users/dto/assign-branches.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class AssignBranchesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  branchIds: string[];
}
```

- [x] **Step 2: Service methods**

Add to `apps/api/src/users/users.service.ts` (read the file first to match its existing constructor/import style exactly, then add these two methods):

```ts
  async findMyBranches(tenantId: string, userId: string, role: Role) {
    if (role === Role.ADMIN) {
      return this.prisma.branch.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
      });
    }
    const assignments = await this.prisma.userBranch.findMany({
      where: { userId },
      include: { branch: true },
    });
    return assignments
      .map((a) => a.branch)
      .filter((b) => b.tenantId === tenantId && b.isActive);
  }

  async assignBranches(tenantId: string, userId: string, branchIds: string[]) {
    await this.assertExists(tenantId, userId);
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds }, tenantId },
    });
    if (branches.length !== branchIds.length) {
      throw new NotFoundException('Alguna sucursal no pertenece a este taller');
    }
    await this.prisma.$transaction([
      this.prisma.userBranch.deleteMany({ where: { userId } }),
      this.prisma.userBranch.createMany({
        data: branchIds.map((branchId) => ({ userId, branchId })),
      }),
    ]);
    return this.prisma.userBranch.findMany({ where: { userId }, include: { branch: true } });
  }
```

You will need to import `Role` from `../generated/prisma/enums` in this file if it isn't already imported, and confirm `assertExists` (or whatever the existing private existence-check helper is named in this file) matches — read the file first and adapt the exact helper name/signature used, don't guess.

- [x] **Step 3: Controller endpoints**

Add to `apps/api/src/users/users.controller.ts`. Add `@Get('me/branches')` **before** the existing `@Get(':id')` handler (NestJS matches routes in declaration order — placing it after `:id` would make `:id` greedily match the literal path `me/branches` as an id value instead), mirroring how `findTechnicians` (`'technicians'`) is already placed before `:id` in this file:

```ts
  @Get('me/branches')
  findMyBranches(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role,
  ) {
    return this.usersService.findMyBranches(tenantId, userId, role);
  }
```

No `@Roles()` on this one — every authenticated user needs to know their own branches, regardless of role.

Add this near the other `@Roles(Role.ADMIN)` mutation endpoints:
```ts
  @Roles(Role.ADMIN)
  @Audit('User')
  @Post(':id/branches')
  assignBranches(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: AssignBranchesDto,
  ) {
    return this.usersService.assignBranches(tenantId, id, dto.branchIds);
  }
```

Add the import: `import { AssignBranchesDto } from './dto/assign-branches.dto';`

- [x] **Step 4: Verify build**

```bash
pnpm --filter @taller/api build
```
Expected: still fails only for the pre-existing `orders.service.ts` reasons.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/users.controller.ts apps/api/src/users/dto/assign-branches.dto.ts
git commit -m "Add GET /users/me/branches and POST /users/:id/branches"
```

---

## Task 8: Backend — `OrdersService`/`OrdersController` branch scoping (fixes the build)

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts`
- Modify: `apps/api/src/orders/orders.controller.ts`

This is the task that fixes the build failure left over from Task 4.

- [ ] **Step 1: Replace the pickup-code/order-number generation logic**

In `apps/api/src/orders/orders.service.ts`, replace the `generateUniquePickupCode` JSDoc comment and the order-number generation lines in BOTH `create` and `intake`.

Add this new private helper right after `generateUniquePickupCode` (same locking rationale, now against the `Branch` row instead of `Tenant`):

```ts
  /**
   * Only safe to call AFTER `tx.branch.update({ data: { nextOrderNumber: { increment: 1 } } })`
   * in the same transaction — mirrors generateUniquePickupCode's locking rationale, now scoped
   * to the branch row instead of the tenant row.
   */
  private async nextOrderNumber(
    tx: Prisma.TransactionClient,
    branchId: string,
  ): Promise<string> {
    const branch = await tx.branch.update({
      where: { id: branchId },
      data: { nextOrderNumber: { increment: 1 } },
    });
    const sequence = String(branch.nextOrderNumber - 1).padStart(4, '0');
    return `${branch.code}${sequence}`;
  }
```

In `create` (around the transaction body), replace:
```ts
      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { nextOrderNumber: { increment: 1 } },
      });
      const orderNumber = tenant.nextOrderNumber - 1;
      const pickupCode = await this.generateUniquePickupCode(tx, tenantId);
```
with:
```ts
      const orderNumber = await this.nextOrderNumber(tx, branchId);
      const pickupCode = await this.generateUniquePickupCode(tx, tenantId);
```

And add `branchId,` to the `tx.order.create({ data: { ... } })` call right after `tenantId,`.

In `intake` (around its transaction body), replace:
```ts
      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { nextOrderNumber: { increment: 1 } },
      });
      const pickupCode = await this.generateUniquePickupCode(tx, tenantId);

      const created = await tx.order.create({
        data: {
          tenantId,
          orderNumber: tenant.nextOrderNumber - 1,
```
with:
```ts
      const orderNumber = await this.nextOrderNumber(tx, branchId);
      const pickupCode = await this.generateUniquePickupCode(tx, tenantId);

      const created = await tx.order.create({
        data: {
          tenantId,
          branchId,
          orderNumber,
```

- [ ] **Step 2: Thread `branchId` through the public method signatures**

`create(tenantId: string, receptionistId: string, dto: CreateOrderDto)` → `create(tenantId: string, branchId: string, receptionistId: string, dto: CreateOrderDto)`.

`intake(tenantId: string, receptionistId: string, dto: IntakeOrderDto, files: ...)` → `intake(tenantId: string, branchId: string, receptionistId: string, dto: IntakeOrderDto, files: ...)`.

Also add `branchId` filtering to `findAll`'s `where` clause (accept an optional `branchId` in its query parameter type and add `...(query.branchId ? { branchId: query.branchId } : {})` to the `where` object, following the exact same pattern already used there for `status`/`technicianId`/`clientId`).

- [ ] **Step 3: Update the controller to pass `branchId` through**

In `apps/api/src/orders/orders.controller.ts`, add the import:
```ts
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
```

Update `create` and `intake` to accept `@CurrentBranch() branchId: string` and pass it through to the service calls in the right argument position (matching the new signatures from Step 2).

Update `findAll` to accept `@CurrentBranch() branchId: string` too, and add `branchId` to the `scoped` query object it builds before calling `ordersService.findAll`.

- [ ] **Step 4: Fix the `orderNumber: number` callers**

`sendIntakeConfirmationEmail` passes `orderNumber: order.orderNumber` into `EmailService.sendIntakeConfirmation`, and `notify` passes it into `buildStatusChangeMessage` — both of those functions' parameter types change from `number` to `string` in Task 11 of this plan. No change needed here in `orders.service.ts` itself for those two call sites (they already just pass the value through), but do NOT run this task's build-fix verification until Task 11 also lands, since `orders.service.ts` alone won't compile clean against those two files' OLD `number`-typed signatures. If you're executing this plan strictly task-by-task via subagent-driven-development, it's fine for Task 8's own build check to still show 2 remaining errors from `email.service.ts`/`notification-message.util.ts` call sites — confirm the errors are ONLY those two, not anything else in `orders.service.ts`.

- [ ] **Step 5: Verify build**

```bash
pnpm --filter @taller/api build
```
Expected: the errors that were present since Task 4 in `orders.service.ts` are now gone. Any remaining errors should be exactly the two `orderNumber: number` vs `string` mismatches described in Step 4 above (in `email.service.ts`/`notification-message.util.ts`, fixed in Task 11) — if there are OTHER errors, stop and report them.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/orders/orders.service.ts apps/api/src/orders/orders.controller.ts
git commit -m "Scope order creation and listing by branch, use branch-prefixed order numbers"
```

---

## Task 9: Backend — `ClientsService`/`ClientsController` branch scoping

**Files:**
- Modify: `apps/api/src/clients/clients.service.ts`
- Modify: `apps/api/src/clients/clients.controller.ts`

- [ ] **Step 1: Service changes**

Add `branchId: string` as a parameter to `create` (right after `tenantId`), and add `branchId,` to the `data` object passed to `this.prisma.client.create`.

Add `branchId` to the `where` clause built in `findAll` (accept it as an optional field on the query parameter type, add `...(query.branchId ? { branchId: query.branchId } : {})`, mirroring the existing `search` pattern).

Add a required `branchId: string` parameter to `findByDocumentId` (right after `tenantId`) and add it to that method's `where` clause directly (not optional — every call site provides one, since intake wizard client search should only ever look within the current branch, per this plan's design spec).

- [ ] **Step 2: Controller changes**

In `apps/api/src/clients/clients.controller.ts`, add the import:
```ts
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
```

Add `@CurrentBranch() branchId: string` to `findAll`, `findByDocumentId`, and `create`, passing it through to the corresponding service calls in the right argument position.

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @taller/api build
```
Expected: same remaining-errors state as the end of Task 8 (the two `orderNumber` type mismatches, fixed in Task 11) — no new errors from this task's files.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/clients/clients.service.ts apps/api/src/clients/clients.controller.ts
git commit -m "Scope client listing, search, and creation by branch"
```

---

## Task 10: Backend — `MotorcyclesService`/`MotorcyclesController` branch scoping

**Files:**
- Modify: `apps/api/src/motorcycles/motorcycles.service.ts`
- Modify: `apps/api/src/motorcycles/motorcycles.controller.ts`

- [ ] **Step 1: Service changes**

Add `branchId: string` as a parameter to `create` (right after `tenantId`), and add `branchId,` to the `data` object passed to `this.prisma.motorcycle.create`.

Add `branchId` to the `where` clause built in `findAll` (accept it as an optional field on the query parameter type, add `...(query.branchId ? { branchId: query.branchId } : {})`, mirroring the existing `clientId` pattern already there).

- [ ] **Step 2: Controller changes**

Read `apps/api/src/motorcycles/motorcycles.controller.ts` first to confirm its exact current structure (this plan hasn't inspected it directly), then add the `CurrentBranch` import and thread `@CurrentBranch() branchId: string` through `findAll` and `create` the same way Task 9 did for clients.

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @taller/api build
```
Expected: same remaining-errors state as the end of Task 9.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/motorcycles/motorcycles.service.ts apps/api/src/motorcycles/motorcycles.controller.ts
git commit -m "Scope motorcycle listing and creation by branch"
```

---

## Task 11: Backend — fix `orderNumber: number` → `string` in message builders

**Files:**
- Modify: `apps/api/src/notifications/whatsapp.service.ts`
- Modify: `apps/api/src/notifications/email.service.ts`
- Modify: `apps/api/src/orders/notification-message.util.ts`
- Modify: `apps/api/src/orders/notification-message.util.spec.ts`

All of these currently just interpolate `orderNumber` into a string template (`` `#${orderNumber}` ``) or pass it straight into another template — none do arithmetic on it, so this is a pure type-signature change with no logic change.

- [ ] **Step 1: `whatsapp.service.ts`**

Change `notifyOrderReceived(phone: string, orderNumber: number)` → `notifyOrderReceived(phone: string, orderNumber: string)`, and `notifyQuotationReady(phone: string, orderNumber: number)` → `notifyQuotationReady(phone: string, orderNumber: string)`. Remove the now-redundant `String(orderNumber)` calls inside both bodies — just pass `orderNumber` directly to `sendTemplate`'s params object, since it's already a string.

- [ ] **Step 2: `email.service.ts`**

Change the `orderNumber: number` parameter type to `orderNumber: string` in `sendQuotationReady`, `sendNotificationMessage`, and the inline type for `sendIntakeConfirmation`'s `data` parameter (`{ clientFirstName: string; orderNumber: number; pickupCode: string; tenantName: string }` → `orderNumber: string`). No other changes needed — every usage is already string interpolation.

- [ ] **Step 3: `notification-message.util.ts`**

Change `orderNumber: number` to `orderNumber: string` in the `buildStatusChangeMessage` parameter type.

- [ ] **Step 4: `notification-message.util.spec.ts`**

Change the three test cases' `orderNumber: 123`, `orderNumber: 456`, `orderNumber: 1` literals to string literals: `orderNumber: '20560123'`, `orderNumber: '20560456'`, `orderNumber: '00010001'` (arbitrary valid-looking branch-prefixed values — exact digits don't matter, just update the type and the expected-message assertions in the first two tests to match whatever values you choose, e.g. `Orden #20560123` instead of `Orden #123`).

- [ ] **Step 5: Verify build and tests**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/api test
```
Expected: **both succeed with zero errors** — this is the task that clears every remaining error left over since Task 4.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/notifications/whatsapp.service.ts apps/api/src/notifications/email.service.ts apps/api/src/orders/notification-message.util.ts apps/api/src/orders/notification-message.util.spec.ts
git commit -m "Change orderNumber parameter type from number to string throughout notifications"
```

---

## Task 12: Frontend — types

**Files:**
- Modify: `apps/web/src/lib/types.ts`

- [ ] **Step 1: Change `orderNumber` from `number` to `string`**

There are 5 occurrences of `orderNumber: number` in this file (on `Order`, and on the `order?: { orderNumber: number }` shorthand used by `Warranty`, `Payment`, `Invoice`, and possibly one more — search for all of them). Change every one to `orderNumber: string`.

- [ ] **Step 2: Add the `Branch` type**

Add near `AccessoryOption` (or any other simple catalog-shaped interface):
```ts
export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
  createdAt: string;
}
```

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @taller/web build
```
Expected: **this will FAIL** — several pages still assume `orderNumber` is a `number` in ways that need fixing in later tasks of this plan (e.g. `orders/new/page.tsx`'s local `buildIntakeMessage` type). Confirm the errors are all `orderNumber`-related type mismatches, not something unrelated.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/types.ts
git commit -m "Change Order.orderNumber to string, add Branch type"
```

---

## Task 13: Frontend — persist selected branch, attach it to every API call

**Files:**
- Modify: `apps/web/src/lib/auth-storage.ts`
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: `auth-storage.ts`**

Add a new key and three methods, following the exact style already used for the access token:

```ts
const BRANCH_ID_KEY = 'taller_branch_id';
```
(add this near the top, alongside `ACCESS_TOKEN_KEY`/`REFRESH_TOKEN_KEY`/`USER_KEY`)

Add to the `authStorage` object:
```ts
  getBranchId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(BRANCH_ID_KEY);
  },
  setBranchId(branchId: string) {
    localStorage.setItem(BRANCH_ID_KEY, branchId);
  },
  clearBranchId() {
    localStorage.removeItem(BRANCH_ID_KEY);
  },
```

Also add `localStorage.removeItem(BRANCH_ID_KEY);` to the existing `clear()` method, so logging out clears the selected branch too.

- [ ] **Step 2: `api.ts`**

In the `request<T>` function, add the branch header alongside the existing `Authorization` header:

```ts
  const token = authStorage.getAccessToken();
  const branchId = authStorage.getBranchId();

  const finalHeaders: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(branchId ? { 'X-Branch-Id': branchId } : {}),
    ...(headers as Record<string, string>),
  };
```

(This replaces the existing `const token = ...` line and `finalHeaders` block — only the two marked additions are new, everything else in that function stays as-is.)

- [ ] **Step 3: Verify build**

```bash
pnpm --filter @taller/web build
```
Expected: same failure state as the end of Task 12 (unrelated `orderNumber` type errors elsewhere) — no new errors from these two files.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/auth-storage.ts apps/web/src/lib/api.ts
git commit -m "Persist selected branch and attach it as X-Branch-Id on every request"
```

---

## Task 14: Frontend — branch state in `AuthProvider`

**Files:**
- Modify: `apps/web/src/components/providers/auth-provider.tsx`

- [ ] **Step 1: Extend the context**

Add to `AuthContextValue`:
```ts
  branches: Branch[];
  currentBranchId: string | null;
  setCurrentBranchId: (branchId: string) => void;
```
Add the import: `import type { Branch } from '@/lib/types';`

Add state and a fetch-on-user-change effect inside `AuthProvider`:
```ts
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [currentBranchId, setCurrentBranchIdState] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!user) {
      setBranches([]);
      setCurrentBranchIdState(null);
      return;
    }
    api.get<Branch[]>('/users/me/branches').then((fetched) => {
      setBranches(fetched);
      const stored = authStorage.getBranchId();
      const validStored = stored && fetched.some((b) => b.id === stored) ? stored : null;
      const resolved = validStored ?? (fetched.length > 0 ? fetched[0].id : null);
      if (resolved) {
        authStorage.setBranchId(resolved);
        setCurrentBranchIdState(resolved);
      }
    });
  }, [user]);

  const setCurrentBranchId = React.useCallback((branchId: string) => {
    authStorage.setBranchId(branchId);
    setCurrentBranchIdState(branchId);
    if (typeof window !== 'undefined') window.location.reload();
  }, []);
```

Note: `setCurrentBranchId` does a full page reload after switching — this is deliberate and simple for this first phase, avoiding the need to coordinate SWR cache invalidation across every branch-scoped page individually. It can be replaced with a more surgical global-revalidate approach later without changing the public API of this function.

Add `branches, currentBranchId, setCurrentBranchId` to the `<AuthContext.Provider value={{ ... }}>` object.

- [ ] **Step 2: Verify build**

```bash
pnpm --filter @taller/web build
```
Expected: same failure state as the end of Task 13 — no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/providers/auth-provider.tsx
git commit -m "Fetch and track the current user's accessible/selected branch"
```

---

## Task 15: Frontend — branch switcher in the topbar

**Files:**
- Modify: `apps/web/src/components/layout/topbar.tsx`

- [ ] **Step 1: Add the switcher**

Add this component above `export function Topbar()`, and the `Building2` icon to the existing `lucide-react` import line:
```ts
import { Bell, Building2, Menu, LogOut, User as UserIcon } from 'lucide-react';
```

```tsx
function BranchSwitcher() {
  const { branches, currentBranchId, setCurrentBranchId } = useAuth();

  if (branches.length <= 1) return null;

  const current = branches.find((b) => b.id === currentBranchId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Building2 className="size-4" />
          <span className="hidden text-sm font-medium sm:inline">{current?.name ?? 'Sucursal'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Cambiar de sucursal</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {branches.map((branch) => (
          <DropdownMenuItem key={branch.id} onSelect={() => setCurrentBranchId(branch.id)}>
            {branch.name}
            {branch.id === currentBranchId ? ' ✓' : ''}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Render it in `Topbar`, right before `<NotificationBell />`:
```tsx
      <BranchSwitcher />
      <NotificationBell />
      <ThemeToggle />
```

- [ ] **Step 2: Verify build**

```bash
pnpm --filter @taller/web build
```
Expected: same failure state as the end of Task 14 — no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/layout/topbar.tsx
git commit -m "Add branch switcher to topbar, visible when the user has more than one branch"
```

---

## Task 16: Frontend — fix remaining `orderNumber` type errors (clears the build)

**Files:**
- Modify: `apps/web/src/app/(app)/orders/new/page.tsx`

- [ ] **Step 1: Fix the local type and message builder**

In `apps/web/src/app/(app)/orders/new/page.tsx`, find the local interface/type that declares `orderNumber: number` (used by `buildIntakeMessage`'s parameter type, around where `data.orderNumber` is interpolated into the confirmation message) and change it to `orderNumber: string`. No other logic changes needed — every usage in this file already just interpolates the value into a template string or passes it straight through from `order.orderNumber` (already `string` after Task 12's type change) to `buildIntakeMessage`.

- [ ] **Step 2: Verify build**

```bash
pnpm --filter @taller/web build
```
Expected: **succeeds with zero errors** — this is the task that clears every remaining frontend error left over since Task 12.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(app)/orders/new/page.tsx"
git commit -m "Fix remaining orderNumber type mismatch in intake wizard confirmation message"
```

---

## Task 17: Frontend — Sucursales tab in Settings

**Files:**
- Modify: `apps/web/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Read the current file structure first**

This file already has a `Tabs` component with several tabs (at minimum "Servicios rápidos" and "Accesorios", built in an earlier phase of this project, each backed by a `<Something>Settings` + `<Something>Form` function pair at the bottom of the file following an identical structural pattern: a `Dialog` + `DialogTrigger` "Nuevo X" button, a list of rows each with move-up/move-down or edit/delete buttons, and a small create/edit form). Read the file in full before editing, to copy that exact established pattern rather than inventing a new one.

- [ ] **Step 2: Add the tab**

Add a new `<TabsTrigger value="branches">Sucursales</TabsTrigger>` and corresponding `<TabsContent value="branches"><BranchesSettings /></TabsContent>`, in the same place the other tabs are declared.

- [ ] **Step 3: Add `BranchesSettings`/`BranchForm`**

Add these two functions at the end of the file, mirroring the existing `AccessoryOptionsSettings`/`AccessoryOptionForm` (or `QuickServicesSettings`/`QuickServiceForm`) pair structurally, but adapted for `Branch`'s fields (name, code, address, city, phone, email, isActive) instead of a single `label` — and using `PATCH /branches/:id` for both editing fields AND toggling `isActive` (there's no separate reorder/delete concept for branches, unlike the accessory/quick-service catalogs — just create and edit, matching this plan's Task 6 backend which only exposes `create`/`update`, no `remove`/`reorder`). Use `POST /branches` to create and `PATCH /branches/:id` to edit, calling `api.post`/`api.patch` the same way the sibling settings sections do. Include the 4-digit `code` field with a `maxLength={4}` and `inputMode="numeric"` input, since the backend validates it must be exactly 4 digits.

- [ ] **Step 4: Add branch assignment to the existing Users tab**

The existing `UsersSettings` function (already in this file, listing users in a `Table` with columns Nombre/Correo/Rol/Estado) gains a fifth column, "Sucursales", showing a small "Asignar" button that opens a dialog with a checkbox per branch, calling the `POST /users/:id/branches` endpoint built in Task 7. Read `UsersSettings`'s current exact code first (already shown to you above) and add to it — do not rewrite the whole function, only add what's described below.

Add a new column header right after `<TableHead>Estado</TableHead>`:
```tsx
            <TableHead>Sucursales</TableHead>
```

Add a new cell in the row-mapping, right after the existing `Estado` `<TableCell>`:
```tsx
              <TableCell>
                <AssignBranchesButton user={u} onAssigned={() => mutate()} />
              </TableCell>
```

Add this new component at the end of the file (near `BranchForm`/`BranchesSettings` from Step 3):
```tsx
function AssignBranchesButton({
  user,
  onAssigned,
}: {
  user: UserSummary;
  onAssigned: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const { data: branches } = useApiSWR<Branch[]>(open ? '/branches' : null);
  const { data: assigned, mutate: mutateAssigned } = useApiSWR<{ branch: Branch }[]>(
    open ? `/users/${user.id}/branches` : null,
  );
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (assigned) setSelectedIds(assigned.map((a) => a.branch.id));
  }, [assigned]);

  async function handleSave() {
    setIsSubmitting(true);
    try {
      await api.post(`/users/${user.id}/branches`, { branchIds: selectedIds });
      toast.success('Sucursales asignadas');
      mutateAssigned();
      onAssigned();
      setOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Asignar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Sucursales de {user.firstName} {user.lastName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-4">
          {branches?.map((branch) => (
            <Label key={branch.id} className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={selectedIds.includes(branch.id)}
                onCheckedChange={(checked) =>
                  setSelectedIds((prev) =>
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
        <DialogFooter>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

This needs `Checkbox` imported from `@/components/ui/checkbox` (already used elsewhere in this codebase, e.g. `accessory-checklist.tsx`) and `Branch` imported from `@/lib/types` — add both imports at the top of the file if not already present (`UserSummary` is already imported, matching what `UsersSettings` already uses).

Note: `GET /users/:id/branches` is used above to pre-populate the checkboxes with the user's current assignments, but this exact endpoint wasn't listed among Task 7's additions (which only added `GET /users/me/branches` and `POST /users/:id/branches`) — add a small `GET /users/:id/branches` endpoint too (roles `ADMIN`, same as the other user-management endpoints), backed by a trivial service method `findUserBranches(tenantId, userId)` that does `this.prisma.userBranch.findMany({ where: { userId }, include: { branch: true } })` after verifying the user belongs to the tenant (reuse whatever existing-user assertion helper `UsersService` already has). Add this now, in this same commit, since it's a small omission from Task 7 that this step depends on — don't skip it.

- [ ] **Step 5: Verify build**

```bash
pnpm --filter @taller/api build
pnpm --filter @taller/web build
```
Expected: both succeed with no errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(app)/settings/page.tsx" apps/api/src/users/users.service.ts apps/api/src/users/users.controller.ts
git commit -m "Add Sucursales tab and per-user branch assignment to Settings"
```

---

## Task 18: Final verification

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

- [ ] **Step 3: Manual smoke test**

With both dev servers running (`pnpm --filter @taller/api start:dev`, `pnpm --filter @taller/web dev`):
- [ ] Log in as `admin@tallerdemo.com` / `Password123!`. Confirm the app loads normally and existing orders/clients/motorcycles are still visible (the "Principal" branch backfill from Task 3 should mean nothing looks empty or broken).
- [ ] Go to Configuración → Sucursales, create a second branch (e.g. name "Sucursal Norte", code `2056`).
- [ ] Confirm the branch switcher now appears in the topbar (it's hidden for single-branch users) — since ADMIN sees all branches automatically, it should show both "Principal" and "Sucursal Norte".
- [ ] Switch to "Sucursal Norte". Confirm the page reloads and the Órdenes/Clientes/Vehículos lists are now empty (nothing has been created in this branch yet).
- [ ] Create a new order via the intake wizard while "Sucursal Norte" is selected — confirm the resulting order number starts with `2056` (e.g. `20560001`).
- [ ] Switch back to "Principal" — confirm the original orders reappear, and their order numbers look like `0001000X`.
- [ ] Create (or find) a non-ADMIN user (e.g. a RECEPTIONIST) with no branch assignment yet — log in as them and confirm the branch switcher does NOT appear (they have zero accessible branches) and that order/client/motorcycle lists behave sensibly (likely empty, since nothing is assigned). Then, as ADMIN, use `POST /users/:id/branches` (via the Settings → Sucursales user-assignment UI if you built one, or directly via the API docs at `/api/docs` if the UI for this wasn't part of this plan's scope) to assign that user to "Principal", log in as them again, and confirm they now see Principal's data and the switcher appears if they have more than one branch.

- [ ] **Step 4: Final commit (only if the manual pass required fixes)**

```bash
git add -A
git commit -m "Fix issues found during manual verification of Sucursales Fase 1"
```
