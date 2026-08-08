# Integración POS ↔ Taller — Fase 1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una sola cuenta pueda tener un rol independiente en el Taller y en el POS, que al entrar se elija entre los dos sistemas con un clic, y que ambos compartan la identidad Mobulaa.

**Architecture:** `User.role` pasa a ser opcional y se agrega `User.posRole`; `null` significa "sin acceso a ese sistema", y una restricción `CHECK` impide que ambos queden vacíos. El sistema activo en el frontend **se deriva de la URL** (`/pos/*` es POS, todo lo demás es Taller), así que no hay estado nuevo que sincronizar. La identidad Mobulaa entra cambiando tres variables CSS, porque el tema actual no tiene ni una gota de saturación.

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL, Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui, Jest.

**Spec:** `docs/superpowers/specs/2026-08-05-integracion-pos-taller-design.md`

---

## Convenciones de este repositorio

Leer antes de empezar. Ignorarlas cuesta tiempo:

- **Nunca `pnpm lint`.** Corre con `--fix` sobre todo el repo, lo reformatea entero y se pasa del tiempo límite. Usar siempre `npx eslint <rutas concretas>` desde `apps/api` o `apps/web` (el `eslint.config.js` vive dentro de cada app, no en la raíz).
- **Nunca `prisma migrate dev`.** Es interactivo y falla en este entorno. El procedimiento está en la Task 1.
- **Las pruebas no usan `TestingModule`.** Se instancia el servicio a mano con dobles escritos a mano: `new UsersService(prisma as never)`. Ver `apps/api/src/users/users.service.spec.ts`.
- **`packages/shared` es solo para el frontend.** `apps/api` **no** depende de él; usa los enums generados por Prisma en `apps/api/src/generated/prisma/enums`. Los enums de `packages/shared/src/enums.ts` son una copia manual — si se toca uno, se toca el otro.
- **Comentarios en español**, como el resto del código. Explican *por qué*, no *qué*.
- **Mensajes de commit en inglés**, como todo el historial.

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `apps/api/prisma/migrations/<ts>_pos_role/migration.sql` | Enum `PosRole`, `role` opcional, columna `posRole`, restricción `CHECK` |
| `apps/api/src/common/decorators/pos-roles.decorator.ts` | Decorador `@PosRoles()` con su propia clave de metadatos |
| `apps/api/src/common/guards/roles.guard.spec.ts` | Prueba del guard, incluida la colisión `'ADMIN'` |
| `apps/web/src/lib/active-system.ts` | `systemForPath()` y `systemsForUser()` — funciones puras, sin React |
| `apps/web/src/components/layout/system-switcher.tsx` | Control de cambio de sistema en la barra superior |
| `apps/web/src/app/(app)/pos/page.tsx` | Marcador de posición del POS |

**Se modifican:**

| Archivo | Cambio |
|---|---|
| `apps/api/prisma/schema.prisma` | `enum PosRole`, `role Role?`, `posRole PosRole?` |
| `apps/api/src/common/decorators/current-user.decorator.ts` | `role: Role \| null`, `posRole: PosRole \| null` |
| `apps/api/src/auth/strategies/jwt.strategy.ts` | Devuelve `posRole` |
| `apps/api/src/auth/auth.service.ts` | `sanitizeUser` incluye `posRole`; tipos nulables |
| `apps/api/src/common/guards/roles.guard.ts` | Permite si coincide el rol de taller **o** el de POS |
| `apps/api/src/users/users.service.ts` | Invariante de "al menos un sistema", regla del gerente, ramas de sucursal, `findMyBranches` |
| `apps/api/src/users/users.controller.ts` | Pasa `posRole`; `@PosRoles(PosRole.ADMIN)` en el panel |
| `apps/api/src/users/dto/create-user.dto.ts` | `role` opcional, `posRole` opcional |
| `apps/api/prisma/seed.ts` | Un usuario de ejemplo solo-POS |
| `packages/shared/src/enums.ts` | `PosRole` |
| `apps/web/src/lib/auth-storage.ts` | `StoredUser.role` nulable, `posRole` |
| `apps/web/src/lib/types.ts` | `UserSummary.role` nulable, `posRole` |
| `apps/web/src/components/providers/auth-provider.tsx` | Redirige a `/` en vez de `/dashboard` |
| `apps/web/src/app/page.tsx` | Selector de sistema |
| `apps/web/src/app/globals.css` | Naranja Mobulaa en `--primary`, `--primary-foreground`, `--ring` |
| `apps/web/src/components/layout/nav-config.ts` | `TALLER_NAV` y `POS_NAV` |
| `apps/web/src/components/layout/sidebar-nav.tsx` | Elige el menú según la URL; tolera `role` nulo |
| `apps/web/src/components/layout/topbar.tsx` | Monta `SystemSwitcher` |
| `apps/web/src/app/(app)/settings/page.tsx` | Dos columnas de rol y dos selectores |
| `scripts/pruebas-humo.sh` | Comprobaciones de acceso por sistema |

---

## Task 1: Esquema y migración

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_pos_role/migration.sql`

- [ ] **Step 1: Respaldar la base antes de tocarla**

```bash
cd apps/api
docker compose -p sistema-taller-motos exec -T postgres pg_dump -U postgres taller_motos > "$TMPDIR/taller-antes-de-pos-role.sql"
```

Si el contenedor no responde, Docker Desktop no está arriba: arrancarlo y `docker compose up -d` antes de seguir. Ha pasado dos veces en este proyecto.

- [ ] **Step 2: Editar el esquema**

En `apps/api/prisma/schema.prisma`, agregar el enum junto a `enum Role`:

```prisma
enum PosRole {
  ADMIN
  CASHIER
}
```

Y en `model User`, reemplazar la línea `role Role @default(RECEPTIONIST)` por:

```prisma
  // null = sin acceso a ese sistema. La restricción users_at_least_one_role
  // (ver la migración) impide que los dos queden vacíos, porque sería una
  // cuenta que puede iniciar sesión y no puede ir a ninguna parte.
  role         Role?
  posRole      PosRole?
```

El `@default(RECEPTIONIST)` **se elimina**: si se quedara, crear un cajero sin rol de taller le daría Recepcionista sin pedirlo, que es exactamente lo que este cambio quiere evitar. Ningún código depende del valor por omisión — `registerTenant`, `seed.ts` y `UsersService.create` pasan el rol siempre de forma explícita.

- [ ] **Step 3: Escribir la migración a mano**

`prisma migrate dev` es interactivo y falla en este entorno. Crear la carpeta con marca de tiempo (formato `AAAAMMDDHHMMSS`, igual que las existentes) y escribir el SQL:

```bash
mkdir -p apps/api/prisma/migrations/20260805090000_pos_role
```

`apps/api/prisma/migrations/20260805090000_pos_role/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "PosRole" AS ENUM ('ADMIN', 'CASHIER');

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "role" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ADD COLUMN "posRole" "PosRole";

-- Nadie puede quedar sin acceso a ningún sistema. Los usuarios que ya existen
-- conservan su rol de taller, así que ninguna fila viola esto al aplicarse.
ALTER TABLE "users" ADD CONSTRAINT "users_at_least_one_role"
  CHECK ("role" IS NOT NULL OR "posRole" IS NOT NULL);
```

- [ ] **Step 4: Aplicar y regenerar**

```bash
cd apps/api
npx prisma migrate deploy
npx prisma generate
```

Esperado: `1 migration found` y `Applied migration(s)`. Si `migrate deploy` falla por la restricción, hay filas con `role` nulo, lo que no debería poder pasar en este punto — revisar antes de forzar nada.

- [ ] **Step 5: Verificar la restricción contra la base real**

```bash
docker compose -p sistema-taller-motos exec -T postgres psql -U postgres -d taller_motos -c \
  "UPDATE users SET role = NULL WHERE email = 'admin@tallerdemo.com';"
```

Esperado: **falla** con `new row for relation "users" violates check constraint "users_at_least_one_role"`. Si el comando tiene éxito, la restricción no se creó y hay que revisar la migración antes de continuar.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "Let a user hold one role per system"
```

En este punto la API **no compila**: `role` ahora es `Role | null` y unos 40 sitios lo asumían obligatorio. La Task 2 los arregla. Es deliberado que sea un commit aparte: el cambio de esquema se lee solo.

---

## Task 2: Que la API vuelva a compilar con `role` opcional

**Files:**
- Modify: `apps/api/src/common/decorators/current-user.decorator.ts`
- Modify: `apps/api/src/auth/strategies/jwt.strategy.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/users/users.service.ts` (solo firmas)
- Modify: `apps/api/src/users/users.controller.ts` (solo firmas)

- [ ] **Step 1: Ver la lista completa de sitios rotos**

```bash
cd apps/api && npx tsc --noEmit
```

Esperado: errores `Type 'Role | null' is not assignable to type 'Role'`. Esta lista es la tarea; el compilador no deja escapar ninguno.

- [ ] **Step 2: `AuthenticatedUser` gana `posRole`**

En `apps/api/src/common/decorators/current-user.decorator.ts`:

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { PosRole, Role } from '../../generated/prisma/enums';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  email: string;
  role: Role | null;
  posRole: PosRole | null;
}
```

El resto del archivo no cambia.

- [ ] **Step 3: La estrategia JWT devuelve los dos roles**

En `apps/api/src/auth/strategies/jwt.strategy.ts`, dentro de `validate()`, reemplazar el `return`:

```ts
    // El payload del token no lleva rol a propósito: `validate` ya releyó al
    // usuario de la base, así que el rol siempre viene fresco. Meterlo en el
    // token haría que una sesión abierta conservara un rol revocado.
    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      posRole: user.posRole,
    };
```

`interface JwtPayload` **no se toca**: nadie lee `payload.role` (el único consumidor del payload es `RealtimeGateway`, y solo usa `tenantId`).

- [ ] **Step 4: `sanitizeUser` incluye `posRole`**

En `apps/api/src/auth/auth.service.ts`, reemplazar `sanitizeUser` completo:

```ts
  private sanitizeUser(user: {
    id: string;
    tenantId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: Role | null;
    posRole: PosRole | null;
  }) {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      posRole: user.posRole,
    };
  }
```

Y en el mismo archivo, cambiar el import de la línea 13:

```ts
import { PosRole, Role } from '../generated/prisma/enums';
```

Y el parámetro `role` de `issueTokens` (línea 164) a `role: Role | null`. El payload que arma sigue igual — `role` viaja en el token como estaba, no se agrega `posRole`.

- [ ] **Step 5: Firmas de `UsersService` y `UsersController`**

En `apps/api/src/users/users.service.ts`, cambiar el tipo de `actorRole` a `Role | null` en `findAll`, `findOneScoped`, `create`, `update` y `remove`, y el de `role` en `findMyBranches`. **La lógica no se toca todavía** — eso es la Task 4. Las comparaciones `actorRole === Role.MANAGER` siguen funcionando con `null` (dan `false`, que es lo correcto).

En `apps/api/src/users/users.controller.ts`, cambiar los cinco `@CurrentUser('role') role: Role` a `@CurrentUser('role') role: Role | null`.

- [ ] **Step 6: Compilar y correr las pruebas**

```bash
cd apps/api && npx tsc --noEmit && npx jest
```

Esperado: `tsc` sin salida, y todas las pruebas en verde. Las de `users.service.spec.ts` siguen pasando porque su lógica no cambió.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src
git commit -m "Carry both system roles through authentication"
```

---

## Task 3: `@PosRoles` y el guard de roles

**Files:**
- Create: `apps/api/src/common/decorators/pos-roles.decorator.ts`
- Create: `apps/api/src/common/guards/roles.guard.spec.ts`
- Modify: `apps/api/src/common/guards/roles.guard.ts`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `apps/api/src/common/guards/roles.guard.spec.ts`:

```ts
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { PosRole, Role } from '../../generated/prisma/enums';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { POS_ROLES_KEY } from '../decorators/pos-roles.decorator';

/** Un Reflector falso que devuelve lo que se le indique por clave de metadatos. */
function makeReflector(metadata: Record<symbol | string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => metadata[key as string],
  } as unknown as Reflector;
}

function contextFor(user: unknown): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const tallerAdmin = { role: Role.ADMIN, posRole: null };
  const posAdmin = { role: null, posRole: PosRole.ADMIN };
  const cashier = { role: null, posRole: PosRole.CASHIER };

  it('deja pasar a cualquiera cuando no hay roles exigidos', () => {
    const guard = new RolesGuard(makeReflector({}));
    expect(guard.canActivate(contextFor(cashier))).toBe(true);
  });

  it('deja pasar cuando coincide el rol de taller', () => {
    const guard = new RolesGuard(makeReflector({ [ROLES_KEY]: [Role.ADMIN] }));
    expect(guard.canActivate(contextFor(tallerAdmin))).toBe(true);
  });

  it('deja pasar cuando coincide el rol de POS', () => {
    const guard = new RolesGuard(
      makeReflector({ [POS_ROLES_KEY]: [PosRole.ADMIN] }),
    );
    expect(guard.canActivate(contextFor(posAdmin))).toBe(true);
  });

  it('deja pasar si coincide cualquiera de los dos', () => {
    const guard = new RolesGuard(
      makeReflector({
        [ROLES_KEY]: [Role.ADMIN, Role.MANAGER],
        [POS_ROLES_KEY]: [PosRole.ADMIN],
      }),
    );
    expect(guard.canActivate(contextFor(posAdmin))).toBe(true);
    expect(guard.canActivate(contextFor(tallerAdmin))).toBe(true);
    expect(guard.canActivate(contextFor(cashier))).toBe(false);
  });

  // La razón de que sean dos claves de metadatos y no una sola lista mezclada:
  // Role.ADMIN y PosRole.ADMIN son la MISMA cadena 'ADMIN'. Con una sola lista,
  // un endpoint del taller marcado @Roles(Role.ADMIN) dejaría entrar a un
  // administrador del POS que no tiene ningún rol en el taller.
  it('NO deja entrar a un admin del POS en un endpoint que solo exige rol de taller', () => {
    const guard = new RolesGuard(makeReflector({ [ROLES_KEY]: [Role.ADMIN] }));
    expect(guard.canActivate(contextFor(posAdmin))).toBe(false);
  });

  it('niega cuando no hay usuario', () => {
    const guard = new RolesGuard(makeReflector({ [ROLES_KEY]: [Role.ADMIN] }));
    expect(guard.canActivate(contextFor(undefined))).toBe(false);
  });
});
```

- [ ] **Step 2: Correr la prueba para verla fallar**

```bash
cd apps/api && npx jest src/common/guards/roles.guard.spec.ts
```

Esperado: FALLA con `Cannot find module '../decorators/pos-roles.decorator'`.

- [ ] **Step 3: Crear el decorador**

`apps/api/src/common/decorators/pos-roles.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';
import { PosRole } from '../../generated/prisma/enums';

// Clave separada de ROLES_KEY a propósito: Role.ADMIN y PosRole.ADMIN son la
// misma cadena 'ADMIN'. Si compartieran lista, exigir el ADMIN del taller
// dejaría entrar también al del POS.
export const POS_ROLES_KEY = 'posRoles';
export const PosRoles = (...roles: PosRole[]) => SetMetadata(POS_ROLES_KEY, roles);
```

- [ ] **Step 4: Reescribir el guard**

`apps/api/src/common/guards/roles.guard.ts` completo:

```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { POS_ROLES_KEY } from '../decorators/pos-roles.decorator';
import { PosRole, Role } from '../../generated/prisma/enums';
import { RequestWithUser } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      ROLES_KEY,
      targets,
    );
    const requiredPosRoles = this.reflector.getAllAndOverride<PosRole[]>(
      POS_ROLES_KEY,
      targets,
    );

    const wantsTaller = !!requiredRoles?.length;
    const wantsPos = !!requiredPosRoles?.length;
    // Sin ninguna exigencia el endpoint queda abierto, que es como se ha
    // comportado siempre; cambiarlo aquí cerraría media API de golpe.
    if (!wantsTaller && !wantsPos) return true;

    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) return false;

    // Basta con cumplir uno de los dos lados: un endpoint puede ser para el
    // administrador del taller O para el del POS.
    const tallerOk =
      wantsTaller && !!user.role && requiredRoles.includes(user.role);
    const posOk =
      wantsPos && !!user.posRole && requiredPosRoles.includes(user.posRole);
    return tallerOk || posOk;
  }
}
```

- [ ] **Step 5: Correr la prueba para verla pasar**

```bash
cd apps/api && npx jest src/common/guards/roles.guard.spec.ts
```

Esperado: 6 pruebas en verde.

- [ ] **Step 6: Correr toda la suite, que este guard protege toda la API**

```bash
cd apps/api && npx jest
```

Esperado: todo en verde.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common
git commit -m "Let an endpoint accept either system's role"
```

---

## Task 4: Reglas de acceso en `UsersService`

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.service.spec.ts`

- [ ] **Step 1: Escribir las pruebas que fallan**

Añadir al final de `apps/api/src/users/users.service.spec.ts`, dentro del `describe` exterior. Añadir también `PosRole` al import de la línea 7: `import { PosRole, Role } from '../generated/prisma/enums';`

```ts
  describe('acceso por sistema', () => {
    const baseDto = {
      email: 'nuevo@taller.com',
      password: 'password123',
      firstName: 'Nuevo',
      lastName: 'Usuario',
    };

    it('rechaza crear un usuario sin acceso a ningún sistema', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const service = makeService({ user: { findUnique } });

      await expect(
        service.create(tenantId, adminId, Role.ADMIN, {
          ...baseDto,
          branchIds: [branchA],
        } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('permite crear un usuario que solo entra al POS', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const findManyBranch = jest.fn().mockResolvedValue([{ id: branchA }]);
      const tx = {
        user: {
          create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
            expect(data.role).toBeUndefined();
            expect(data.posRole).toBe(PosRole.CASHIER);
            return { id: 'cajero-1' };
          }),
        },
        userBranch: { createMany: jest.fn() },
      };
      const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(tx));
      const service = makeService({
        user: { findUnique },
        branch: { findMany: findManyBranch },
        $transaction,
      });

      await service.create(tenantId, adminId, Role.ADMIN, {
        ...baseDto,
        posRole: PosRole.CASHIER,
        branchIds: [branchA],
      } as never);

      // Un cajero no es administrador de ningún lado, así que necesita sucursal.
      expect(tx.userBranch.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'cajero-1', branchId: branchA }],
      });
    });

    it('no exige sucursales a un administrador del POS', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const tx = {
        user: { create: jest.fn().mockResolvedValue({ id: 'pos-admin' }) },
        userBranch: { createMany: jest.fn() },
      };
      const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(tx));
      const service = makeService({ user: { findUnique }, $transaction });

      await service.create(tenantId, adminId, Role.ADMIN, {
        ...baseDto,
        posRole: PosRole.ADMIN,
      } as never);

      expect(tx.userBranch.createMany).not.toHaveBeenCalled();
    });

    it('rechaza que un GERENTE otorgue el rol de administrador del POS', async () => {
      const service = makeService({});
      await expect(
        service.create(tenantId, managerId, Role.MANAGER, {
          ...baseDto,
          posRole: PosRole.ADMIN,
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza que una edición deje al usuario sin ningún sistema', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValue({ id: 'target', role: Role.TECHNICIAN, posRole: null });
      const service = makeService({ user: { findFirst } });

      await expect(
        service.update(tenantId, adminId, Role.ADMIN, 'target', { role: null }),
      ).rejects.toThrow(BadRequestException);
    });

    it('permite quitar el rol de taller si conserva el del POS', async () => {
      const findFirst = jest.fn().mockResolvedValue({
        id: 'target',
        role: Role.TECHNICIAN,
        posRole: PosRole.CASHIER,
      });
      const update = jest.fn().mockResolvedValue({ id: 'target' });
      const service = makeService({ user: { findFirst, update } });

      await service.update(tenantId, adminId, Role.ADMIN, 'target', {
        role: null,
      });

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: null } }),
      );
    });

    it('muestra todas las sucursales a un administrador del POS sin rol de taller', async () => {
      const findManyBranch = jest.fn().mockResolvedValue([{ id: branchA }]);
      const service = makeService({ branch: { findMany: findManyBranch } });

      await service.findMyBranches(tenantId, 'pos-admin', null, PosRole.ADMIN);

      expect(findManyBranch).toHaveBeenCalledWith({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
      });
    });

    it('limita a un cajero a las sucursales que tiene asignadas', async () => {
      const findManyUserBranch = jest
        .fn()
        .mockResolvedValue([{ branch: { id: branchA } }]);
      const service = makeService({
        userBranch: { findMany: findManyUserBranch },
      });

      const result = await service.findMyBranches(
        tenantId,
        'cajero-1',
        null,
        PosRole.CASHIER,
      );

      expect(result).toEqual([{ id: branchA }]);
    });
  });
```

- [ ] **Step 2: Correr las pruebas para verlas fallar**

```bash
cd apps/api && npx jest src/users/users.service.spec.ts
```

Esperado: FALLAN. `findMyBranches` recibe 4 argumentos y hoy acepta 3, y ninguna de las validaciones nuevas existe.

- [ ] **Step 3: Añadir el ayudante y la invariante**

En `apps/api/src/users/users.service.ts`, cambiar el import de la línea 12 a `import { PosRole, Role } from '../generated/prisma/enums';`, añadir `posRole: true` a `SAFE_SELECT` (después de `role: true`), y añadir esta función arriba del `@Injectable()`:

```ts
/** ADMIN de cualquiera de los dos sistemas ve todas las sucursales: un
 * administrador del POS necesita ver todas las cajas aunque no toque el taller. */
function isAnyAdmin(role: Role | null, posRole: PosRole | null) {
  return role === Role.ADMIN || posRole === PosRole.ADMIN;
}
```

- [ ] **Step 4: Reescribir `create`**

Reemplazar el cuerpo de `create` desde su primera línea hasta el cierre de la asignación de `branchIds`:

```ts
  async create(
    tenantId: string,
    actorUserId: string,
    actorRole: Role | null,
    dto: CreateUserDto,
  ) {
    // Una cuenta sin rol en ningún sistema puede iniciar sesión y no puede ir
    // a ninguna parte. La base tiene la misma regla como restricción CHECK.
    if (!dto.role && !dto.posRole) {
      throw new BadRequestException(
        'El usuario debe tener acceso al menos a un sistema.',
      );
    }
    if (
      actorRole === Role.MANAGER &&
      (dto.role === Role.ADMIN || dto.posRole === PosRole.ADMIN)
    ) {
      throw new ForbiddenException('No puedes crear un usuario Administrador');
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Ese correo ya está registrado');

    // Un ADMIN (de cualquiera de los dos sistemas) ve todas las sucursales, así
    // que no necesita asignación. Un usuario creado por un GERENTE hereda las
    // sucursales del gerente — no hay nada que elegir. Un ADMIN creando a otro
    // debe elegir, porque no tiene "sucursal propia" de la cual heredar.
    let branchIds: string[] = [];
    if (!isAnyAdmin(dto.role ?? null, dto.posRole ?? null)) {
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
          throw new NotFoundException(
            'Alguna sucursal no pertenece a este taller',
          );
        }
        branchIds = dto.branchIds;
      }
    }
```

El resto de `create` (desestructurar `password`, la transacción) no cambia.

- [ ] **Step 5: Reescribir `update`**

```ts
  async update(
    tenantId: string,
    actorUserId: string,
    actorRole: Role | null,
    id: string,
    dto: UpdateUserDto,
  ) {
    const target = await this.findOneScoped(tenantId, actorUserId, actorRole, id);
    if (
      actorRole === Role.MANAGER &&
      (dto.role === Role.ADMIN || dto.posRole === PosRole.ADMIN)
    ) {
      throw new ForbiddenException('No puedes asignar el rol Administrador');
    }
    // Se evalúa el resultado, no lo que llega: una edición parcial que solo
    // manda `role: null` deja el posRole que ya tenía, y eso sí es válido.
    const finalRole = dto.role === undefined ? target.role : dto.role;
    const finalPosRole =
      dto.posRole === undefined ? target.posRole : dto.posRole;
    if (!finalRole && !finalPosRole) {
      throw new BadRequestException(
        'El usuario debe tener acceso al menos a un sistema.',
      );
    }
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: SAFE_SELECT,
    });
  }
```

- [ ] **Step 6: Reescribir `findMyBranches`**

```ts
  async findMyBranches(
    tenantId: string,
    userId: string,
    role: Role | null,
    posRole: PosRole | null,
  ) {
    if (isAnyAdmin(role, posRole)) {
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
```

- [ ] **Step 7: Correr las pruebas para verlas pasar**

```bash
cd apps/api && npx jest src/users/users.service.spec.ts
```

Esperado: las 8 nuevas en verde y las 8 anteriores intactas.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/users
git commit -m "Guard against an account that can reach neither system"
```

---

## Task 5: DTOs, controlador y el panel abierto al admin del POS

**Files:**
- Modify: `apps/api/src/users/dto/create-user.dto.ts`
- Modify: `apps/api/src/users/users.controller.ts`
- Modify: `apps/api/prisma/seed.ts`

- [ ] **Step 1: `role` opcional y `posRole` en el DTO**

En `apps/api/src/users/dto/create-user.dto.ts`, cambiar el import a
`import { PosRole, Role } from '../../generated/prisma/enums';`
y reemplazar el bloque de `role`:

```ts
  // Los dos son opcionales por separado, pero UsersService exige que al menos
  // uno venga: un usuario sin ningún sistema no podría entrar a nada.
  @ApiProperty({ enum: Role, required: false, nullable: true })
  @IsOptional()
  @IsEnum(Role)
  role?: Role | null;

  @ApiProperty({ enum: PosRole, required: false, nullable: true })
  @IsOptional()
  @IsEnum(PosRole)
  posRole?: PosRole | null;
```

`UpdateUserDto` no necesita cambios: es un `PartialType` de este y hereda los dos campos.

- [ ] **Step 2: El controlador pasa `posRole` y abre el panel**

En `apps/api/src/users/users.controller.ts`, cambiar el import a
`import { PosRole, Role } from '../generated/prisma/enums';`
y añadir `import { PosRoles } from '../common/decorators/pos-roles.decorator';`

Añadir `@PosRoles(PosRole.ADMIN)` bajo el `@Roles(...)` de `findAll`, `findOne`, `create`, `update` y `remove` — el administrador del POS administra su propia gente. **No** se añade a `assignBranches` ni a `getUserBranches`, que siguen siendo solo del ADMIN del taller, ni a `findTechnicians`, que es del taller.

Y `findMyBranches` pasa a recibir los dos roles:

```ts
  @Get('me/branches')
  findMyBranches(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role | null,
    @CurrentUser('posRole') posRole: PosRole | null,
  ) {
    return this.usersService.findMyBranches(tenantId, userId, role, posRole);
  }
```

- [ ] **Step 3: Un usuario de ejemplo solo-POS en la semilla**

En `apps/api/prisma/seed.ts`, junto a los otros usuarios (después del bloque del técnico, alrededor de la línea 76), añadir uno que sirva para probar el aislamiento a mano:

```ts
      {
        email: 'cajero@tallerdemo.com',
        // Sin rol de taller a propósito: sirve para comprobar que un usuario
        // solo-POS no ve ni una orden y entra directo al POS sin selector.
        role: null,
        posRole: PosRole.CASHIER,
        firstName: 'Carlos',
        lastName: 'Cajero',
      },
```

Añadir `PosRole` al import de enums del archivo. Mantener la misma forma que los usuarios vecinos (contraseña, `tenantId`, asignación de sucursal) — copiar la del técnico y cambiar solo correo, nombre y roles.

- [ ] **Step 4: Compilar, probar y sembrar**

```bash
cd apps/api && npx tsc --noEmit && npx jest && npx prisma db seed
```

Esperado: sin errores de tipos, pruebas en verde, y la semilla informando de los usuarios creados.

- [ ] **Step 5: Comprobar contra la API viva**

Levantar la API (`pnpm --filter @taller/api start:dev`) y:

```bash
curl -s -X POST http://127.0.0.1:3001/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"cajero@tallerdemo.com","password":"Password123!"}'
```

Esperado: 200, y el objeto `user` de la respuesta trae `"role":null` y `"posRole":"CASHIER"`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src apps/api/prisma/seed.ts
git commit -m "Expose per-system roles through the users API"
```

---

## Task 6: Tipos del frontend

**Files:**
- Modify: `packages/shared/src/enums.ts`
- Modify: `apps/web/src/lib/auth-storage.ts`
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/components/layout/sidebar-nav.tsx`
- Modify: `apps/web/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: `PosRole` en el paquete compartido**

En `packages/shared/src/enums.ts`, tras el bloque de `Role`:

```ts
export const PosRole = {
  ADMIN: 'ADMIN',
  CASHIER: 'CASHIER',
} as const;
export type PosRole = (typeof PosRole)[keyof typeof PosRole];
```

Recordar la nota de la cabecera del archivo: es una copia manual del esquema de Prisma, y ya se cambió allí en la Task 1.

- [ ] **Step 2: Los dos roles en el usuario guardado**

En `apps/web/src/lib/auth-storage.ts`:

```ts
export interface StoredUser {
  id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'MANAGER' | 'RECEPTIONIST' | 'TECHNICIAN' | 'CLIENT' | null;
  posRole: 'ADMIN' | 'CASHIER' | null;
}
```

En `apps/web/src/lib/types.ts`, en `UserSummary`, cambiar `role: Role;` por:

```ts
  role: Role | null;
  posRole: PosRole | null;
```

y añadir `PosRole` al import de `@taller/shared` de ese archivo.

- [ ] **Step 3: Ver qué se rompe**

```bash
cd apps/web && npx tsc --noEmit
```

Esperado: errores en `sidebar-nav.tsx` (`includes(user.role)` con `null`) y en `settings/page.tsx` (`ROLE_LABELS[u.role]`, `currentUser!.role`).

- [ ] **Step 4: Tolerar el rol nulo en el menú lateral**

En `apps/web/src/components/layout/sidebar-nav.tsx`, cambiar las dos líneas afectadas:

```ts
  const isStaff = !!user?.role && ['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(user.role);
```

```ts
  const items = NAV_ITEMS.filter(
    (item) => !item.roles || (!!user?.role && item.roles.includes(user.role)),
  );
```

Un usuario solo-POS deja de ver cualquier entrada del menú del taller, que es justo lo que se busca.

- [ ] **Step 5: Tolerar el rol nulo en Configuración**

En `apps/web/src/app/(app)/settings/page.tsx`:

En la celda del rol de la tabla (línea ~253), mostrar un guion cuando no hay acceso:

```tsx
              <TableCell>
                {u.role ? (
                  <Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
```

Y cambiar `assignableRoleOptions` para que acepte un rol nulo:

```ts
function assignableRoleOptions(currentUserRole: Role | null) {
  return Object.entries(ROLE_LABELS).filter(
    ([value]) => value !== 'CLIENT' && (currentUserRole === 'ADMIN' || value !== 'ADMIN'),
  );
}
```

Las dos llamadas `currentUserRole={currentUser!.role}` compilan sin tocarse una vez el parámetro admite `null`. En `NewUserForm` y `EditUserForm`, cambiar el tipo del prop `currentUserRole` de `Role` a `Role | null`. Los dos formularios se rehacen a fondo en la Task 11; esto es solo para que compile.

- [ ] **Step 6: Compilar**

```bash
cd apps/web && npx tsc --noEmit
```

Esperado: sin salida.

- [ ] **Step 7: Commit**

```bash
git add packages/shared apps/web/src
git commit -m "Teach the web app that a role can be absent"
```

---

## Task 7: La identidad Mobulaa

**Files:**
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Cambiar el color de marca en el tema claro**

En `apps/web/src/app/globals.css`, dentro de `:root`, reemplazar las líneas 14, 15 y 26:

```css
  /* Naranja Mobulaa #F26522. Sobre él va letra oscura, no blanca: con blanco
     el contraste es 3,15:1 y el mínimo legible es 4,5:1 — un botón "Cobrar"
     que no se lee en una pantalla de caja es una venta mal hecha. Con
     oklch(0.145 0 0) sube a 6,28:1. */
  --primary: oklch(0.676 0.189 42.04);
  --primary-foreground: oklch(0.145 0 0);
```

```css
  --ring: oklch(0.676 0.189 42.04);
```

- [ ] **Step 2: Lo mismo en el tema oscuro**

Dentro de `.dark`, reemplazar las líneas 46, 47 y 58:

```css
  --primary: oklch(0.676 0.189 42.04);
  --primary-foreground: oklch(0.145 0 0);
```

```css
  --ring: oklch(0.676 0.189 42.04);
```

El naranja es el mismo en los dos temas: es un color de marca, no una tonalidad que deba invertirse.

- [ ] **Step 3: Compilar**

```bash
pnpm --filter @taller/web build
```

Esperado: termina sin errores.

- [ ] **Step 4: Verificar a ojo, que es lo único que sirve aquí**

Levantar el front, entrar y revisar en los dos temas (el conmutador está en la barra superior):

1. Los botones principales son naranja con letra oscura y se leen bien.
2. En Órdenes, el botón principal naranja y cualquier acción destructiva roja **se distinguen a simple vista**. Están a 15° de matiz (42,04 contra 27,3); la claridad los separa, pero hay que confirmarlo con los ojos. Si se confunden, anotarlo y consultar antes de cambiar el naranja de marca.
3. El anillo de foco al navegar con el tabulador es naranja.
4. Los estados con significado siguen intactos: verde pagado, rojo anulado, ámbar stock bajo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/globals.css
git commit -m "Give both systems the Mobulaa orange"
```

---

## Task 8: Saber a qué sistemas puede entrar cada quien

**Files:**
- Create: `apps/web/src/lib/active-system.ts`

**Sobre las pruebas de esta tarea:** `apps/web` **no tiene jest** — ni configuración, ni dependencia, ni script; hoy no existe una sola prueba de frontend en el repositorio. Montar toda esa infraestructura como efecto colateral de dos funciones de tres líneas sería cambiar el alcance de la fase por la puerta de atrás. Las dos funciones se escriben en una forma que no admite el error clásico (comparación exacta **o** prefijo con barra, nunca `startsWith('/pos')` a secas, que se tragaría una futura ruta `/postventa`), y su comportamiento real queda cubierto por las comprobaciones de navegador de la Task 10, paso 7. Si en el futuro se añaden pruebas al frontend, estas dos funciones son puras y son el primer sitio obvio por donde empezar.

- [ ] **Step 1: Escribir el módulo**

`apps/web/src/lib/active-system.ts`:

```ts
import type { PosRole, Role } from '@taller/shared';

export type SystemId = 'TALLER' | 'POS';

export const SYSTEM_HOME: Record<SystemId, string> = {
  TALLER: '/dashboard',
  POS: '/pos',
};

export const SYSTEM_LABELS: Record<SystemId, string> = {
  TALLER: 'Taller',
  POS: 'Punto de venta',
};

/** El sistema activo se deduce de la URL. No hay estado que guardar ni que
 * sincronizar: la ruta ya es la única fuente de verdad. */
export function systemForPath(pathname: string): SystemId {
  return pathname === '/pos' || pathname.startsWith('/pos/') ? 'POS' : 'TALLER';
}

/** A qué sistemas puede entrar el usuario. El orden importa: es el que se ve
 * en el selector y decide a dónde va quien solo tiene uno. */
export function systemsForUser(
  user: { role: Role | null; posRole: PosRole | null } | null,
): SystemId[] {
  if (!user) return [];
  const systems: SystemId[] = [];
  if (user.role) systems.push('TALLER');
  if (user.posRole) systems.push('POS');
  return systems;
}
```

- [ ] **Step 2: Compilar y revisar el estilo**

```bash
cd apps/web && npx tsc --noEmit && npx eslint src/lib/active-system.ts
```

Esperado: sin salida en ninguno de los dos.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/active-system.ts
git commit -m "Derive the active system from the URL"
```

---

## Task 9: La pantalla de selección

**Files:**
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/providers/auth-provider.tsx`

- [ ] **Step 1: El login lleva al selector, no al panel del taller**

En `apps/web/src/components/providers/auth-provider.tsx`, líneas 97 y 114, cambiar las dos apariciones de `router.push('/dashboard')` por:

```ts
      // A la raíz, no al panel del taller: `/` decide según los accesos que
      // tenga esta persona, y un cajero no tiene nada que hacer en /dashboard.
      router.push('/');
```

- [ ] **Step 2: Reescribir la página raíz**

`apps/web/src/app/page.tsx` completo:

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bike, Store } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { SYSTEM_HOME, SYSTEM_LABELS, systemsForUser, type SystemId } from '@/lib/active-system';
import { Card } from '@/components/ui/card';

const SYSTEM_ICONS: Record<SystemId, typeof Bike> = {
  TALLER: Bike,
  POS: Store,
};

const SYSTEM_DESCRIPTIONS: Record<SystemId, string> = {
  TALLER: 'Órdenes de servicio, cotizaciones y clientes',
  POS: 'Ventas, inventario y separados',
};

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const systems = systemsForUser(user);

  React.useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    // Con un solo acceso no tiene sentido mostrar una pantalla cuyo único
    // propósito sería hacer clic en el único botón que hay.
    if (systems.length === 1) router.replace(SYSTEM_HOME[systems[0]]);
  }, [isLoading, user, systems, router]);

  if (isLoading || !user || systems.length === 1) return null;

  // La base impide crear una cuenta sin ningún sistema, pero si un cambio de
  // roles deja a alguien así en plena sesión, es mejor decírselo que dejarlo
  // en una pantalla en blanco.
  if (systems.length === 0) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Tu cuenta no tiene acceso a ningún sistema. Pídele a un administrador que te
          asigne un rol.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {user.firstName}
        </h1>
        <p className="text-sm text-muted-foreground">¿A dónde quieres entrar?</p>
      </div>
      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        {systems.map((system) => {
          const Icon = SYSTEM_ICONS[system];
          return (
            <Card
              key={system}
              role="button"
              tabIndex={0}
              onClick={() => router.push(SYSTEM_HOME[system])}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  router.push(SYSTEM_HOME[system]);
                }
              }}
              className="flex cursor-pointer flex-col items-center gap-3 p-8 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Icon className="size-10 text-primary" />
              <span className="text-lg font-medium">{SYSTEM_LABELS[system]}</span>
              <span className="text-center text-sm text-muted-foreground">
                {SYSTEM_DESCRIPTIONS[system]}
              </span>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Compilar**

```bash
cd apps/web && npx tsc --noEmit && npx eslint src/app/page.tsx src/components/providers/auth-provider.tsx
```

Esperado: sin salida en ninguno de los dos.

- [ ] **Step 4: Probar los dos caminos en el navegador**

Con la API y el front levantados:

1. Entrar como `admin@tallerdemo.com` (que solo tiene rol de taller) → debe ir **directo** a `/dashboard`, sin pasar por el selector.
2. Darle a ese admin un `posRole` desde Configuración → Usuarios, cerrar sesión, volver a entrar → ahora debe **ver las dos tarjetas**.
3. Entrar como `cajero@tallerdemo.com` → debe ir **directo** a `/pos`.
4. Navegar por teclado con el tabulador: las tarjetas deben recibir el foco con anillo naranja y activarse con Enter y con espacio.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/components/providers/auth-provider.tsx
git commit -m "Ask where to go when a person can reach both systems"
```

---

## Task 10: Cambio de sistema, menú por sistema y la página del POS

**Files:**
- Create: `apps/web/src/components/layout/system-switcher.tsx`
- Create: `apps/web/src/app/(app)/pos/page.tsx`
- Modify: `apps/web/src/components/layout/nav-config.ts`
- Modify: `apps/web/src/components/layout/sidebar-nav.tsx`
- Modify: `apps/web/src/components/layout/topbar.tsx`

- [ ] **Step 1: Partir el menú en dos**

En `apps/web/src/components/layout/nav-config.ts`, renombrar la constante `NAV_ITEMS` a `TALLER_NAV` (sin tocar sus 12 entradas) y añadir al final del archivo:

```ts
// El POS llega en la Fase 2. Su única entrada es la página que anuncia eso.
export const POS_NAV: NavItem[] = [
  { href: '/pos', label: 'Punto de venta', icon: Store },
];

export const NAV_BY_SYSTEM: Record<SystemId, NavItem[]> = {
  TALLER: TALLER_NAV,
  POS: POS_NAV,
};
```

Añadir `Store` al import de `lucide-react` y `import type { SystemId } from '@/lib/active-system';` arriba.

- [ ] **Step 2: El menú lateral elige según la URL**

En `apps/web/src/components/layout/sidebar-nav.tsx`, reemplazar el import de `NAV_ITEMS` por `import { NAV_BY_SYSTEM } from './nav-config';`, añadir `import { systemForPath, SYSTEM_LABELS } from '@/lib/active-system';`, y dentro del componente:

```ts
  const activeSystem = systemForPath(pathname);
  const items = NAV_BY_SYSTEM[activeSystem].filter(
    (item) => !item.roles || (!!user?.role && item.roles.includes(user.role)),
  );
```

Los dos `useApiSWR` de los contadores pasan a pedirse solo en el taller, que es donde se muestran; en el POS son dos peticiones cada 30 segundos para nada:

```ts
  const isStaff =
    activeSystem === 'TALLER' &&
    !!user?.role &&
    ['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(user.role);
```

Y la cabecera del menú refleja dónde estás: reemplazar el texto fijo `Taller Bicimotos` por `{SYSTEM_LABELS[activeSystem]}`.

- [ ] **Step 3: El control de cambio**

`apps/web/src/components/layout/system-switcher.tsx`:

```tsx
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/components/providers/auth-provider';
import {
  SYSTEM_HOME,
  SYSTEM_LABELS,
  systemForPath,
  systemsForUser,
} from '@/lib/active-system';

export function SystemSwitcher() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const systems = systemsForUser(user);

  // Con acceso a un solo sistema no hay nada entre qué cambiar.
  if (systems.length < 2) return null;

  const active = systemForPath(pathname);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <ArrowLeftRight className="size-4" />
          <span className="hidden text-sm font-medium sm:inline">
            {SYSTEM_LABELS[active]}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Cambiar de sistema</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {systems.map((system) => (
          <DropdownMenuCheckboxItem
            key={system}
            checked={system === active}
            onSelect={() => router.push(SYSTEM_HOME[system])}
          >
            {SYSTEM_LABELS[system]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

Es el mismo patrón que `BranchSwitcher`, que ya vive en `topbar.tsx`. La sucursal activa no se toca al cambiar de sistema: vive en `localStorage` y en la cabecera `X-Branch-Id`, así que se conserva sola.

- [ ] **Step 4: Montarlo en la barra superior**

En `apps/web/src/components/layout/topbar.tsx`, añadir `import { SystemSwitcher } from './system-switcher';` y ponerlo **antes** de `<BranchSwitcher />` (primero en qué sistema estás, después en qué sucursal):

```tsx
      <SystemSwitcher />
      <BranchSwitcher />
      <NotificationBell />
      <ThemeToggle />
```

- [ ] **Step 5: La página del POS**

`apps/web/src/app/(app)/pos/page.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Store } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';

export default function PosPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const hasPosAccess = !!user?.posRole;

  React.useEffect(() => {
    // Escribir /pos en la barra de direcciones no debe bastar para entrar.
    if (!isLoading && user && !hasPosAccess) router.replace('/dashboard');
  }, [isLoading, user, hasPosAccess, router]);

  if (!hasPosAccess) return null;

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <Store className="size-10 text-primary" />
      <h1 className="text-xl font-semibold tracking-tight">Punto de venta</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Ventas, productos y separados llegan en la siguiente entrega. Mientras tanto,
        el sistema anterior sigue disponible en tu computador.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Compilar y revisar el estilo**

```bash
cd apps/web && npx tsc --noEmit && npx eslint src/components/layout src/app/\(app\)/pos/page.tsx
```

Esperado: sin salida.

- [ ] **Step 7: Probar el cambio en el navegador**

Con un usuario que tenga los dos accesos:

1. El control de cambio aparece arriba y dice en qué sistema estás.
2. Cambiar al POS: el menú lateral se sustituye por el del POS y la cabecera dice "Punto de venta".
3. Volver al taller: reaparecen las 12 entradas.
4. **La sucursal se conserva** al cruzar en los dos sentidos.
5. Con `cajero@tallerdemo.com` (solo POS): el control **no** aparece, y escribir `/dashboard` a mano no deja ver ninguna entrada del taller.
6. Con `admin@tallerdemo.com` (solo taller): escribir `/pos` a mano rebota a `/dashboard`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src
git commit -m "Switch between the two systems from the top bar"
```

---

## Task 11: El panel de accesos

**Files:**
- Modify: `apps/web/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Etiquetas y opciones del rol de POS**

En `apps/web/src/app/(app)/settings/page.tsx`, junto a `ROLE_LABELS` (línea 29):

```ts
const POS_ROLE_LABELS: Record<PosRole, string> = {
  ADMIN: 'Administrador',
  CASHIER: 'Cajero',
};

// Valor del selector cuando la persona no entra a ese sistema. Un Select de
// shadcn no admite una opción con valor vacío, así que se usa un centinela y
// se traduce a null al enviar.
const SIN_ACCESO = 'NONE';

function assignablePosRoleOptions(currentUserRole: Role | null) {
  return Object.entries(POS_ROLE_LABELS).filter(
    ([value]) => currentUserRole === 'ADMIN' || value !== 'ADMIN',
  );
}
```

Añadir `PosRole` al import de `@taller/shared`.

- [ ] **Step 2: La columna de POS en la tabla**

Añadir una cabecera entre `Rol` y `Estado` (línea ~239). Renombrar la de `Rol` a `Taller` y llamar `POS` a la nueva:

```tsx
            <TableHead>Taller</TableHead>
            <TableHead>POS</TableHead>
```

Y la celda correspondiente, justo después de la del rol de taller:

```tsx
              <TableCell>
                {u.posRole ? (
                  <Badge variant="secondary">{POS_ROLE_LABELS[u.posRole]}</Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
```

- [ ] **Step 3: Los dos selectores en el formulario de creación**

En `NewUserForm`, cambiar el estado inicial:

```tsx
  const [form, setForm] = React.useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    role: Role.RECEPTIONIST as Role | typeof SIN_ACCESO,
    posRole: SIN_ACCESO as PosRole | typeof SIN_ACCESO,
  });
```

`needsBranchPicker` pasa a mirar los dos roles, igual que hace el servidor:

```tsx
  // Un ADMIN de cualquiera de los dos sistemas ve todas las sucursales y no
  // necesita asignación; el resto sí. Misma regla que UsersService.create.
  const isAnyAdmin = form.role === 'ADMIN' || form.posRole === 'ADMIN';
  const needsBranchPicker = currentUserRole === 'ADMIN' && !isAnyAdmin;
```

El envío traduce el centinela a `null`:

```tsx
      await api.post('/users', {
        ...form,
        role: form.role === SIN_ACCESO ? null : form.role,
        posRole: form.posRole === SIN_ACCESO ? null : form.posRole,
        ...(needsBranchPicker ? { branchIds } : {}),
      });
```

Reemplazar el bloque del selector de rol único por los dos, con la opción "Sin acceso" en cada uno:

```tsx
        <div className="flex flex-col gap-1.5">
          <Label>Rol en el Taller</Label>
          <Select
            value={form.role}
            onValueChange={(v) => setForm({ ...form, role: v as Role })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_ACCESO}>Sin acceso</SelectItem>
              {assignableRoleOptions(currentUserRole).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Rol en el POS</Label>
          <Select
            value={form.posRole}
            onValueChange={(v) => setForm({ ...form, posRole: v as PosRole })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SIN_ACCESO}>Sin acceso</SelectItem>
              {assignablePosRoleOptions(currentUserRole).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
```

Y el botón de guardar impide enviar una cuenta que no podría entrar a nada, en vez de dejar que el servidor la rechace:

```tsx
        <Button
          type="submit"
          disabled={
            isSubmitting ||
            (form.role === SIN_ACCESO && form.posRole === SIN_ACCESO) ||
            (needsBranchPicker && branchIds.length === 0)
          }
        >
          {isSubmitting ? 'Guardando...' : 'Crear usuario'}
        </Button>
```

Añadir un aviso bajo los selectores para que el botón deshabilitado no parezca un error:

```tsx
        {form.role === SIN_ACCESO && form.posRole === SIN_ACCESO && (
          <p className="col-span-2 text-sm text-destructive">
            Elige al menos un sistema, o el usuario no podrá entrar a nada.
          </p>
        )}
```

- [ ] **Step 4: Lo mismo en el formulario de edición**

En `EditUserForm`, el estado inicial traduce `null` al centinela:

```tsx
  const [form, setForm] = React.useState({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? '',
    role: (user.role ?? SIN_ACCESO) as Role | typeof SIN_ACCESO,
    posRole: (user.posRole ?? SIN_ACCESO) as PosRole | typeof SIN_ACCESO,
    isActive: user.isActive,
  });
```

y el envío lo traduce de vuelta:

```tsx
      await api.patch(`/users/${user.id}`, {
        ...form,
        role: form.role === SIN_ACCESO ? null : form.role,
        posRole: form.posRole === SIN_ACCESO ? null : form.posRole,
      });
```

Copiar los dos bloques de `<Select>` y el aviso del paso anterior tal cual (usan `assignableRoleOptions` y `assignablePosRoleOptions`, que ya existen), y aplicar la misma condición al botón:

```tsx
        <Button
          type="submit"
          disabled={
            isSubmitting || (form.role === SIN_ACCESO && form.posRole === SIN_ACCESO)
          }
        >
          {isSubmitting ? 'Guardando...' : 'Guardar'}
        </Button>
```

- [ ] **Step 5: Compilar y revisar el estilo**

```bash
cd apps/web && npx tsc --noEmit && npx eslint "src/app/(app)/settings/page.tsx"
```

Esperado: sin salida.

- [ ] **Step 6: Probarlo de punta a punta en el navegador**

Como `admin@tallerdemo.com`, en Configuración → Usuarios:

1. La tabla tiene columnas **Taller** y **POS**, y muestra `—` donde no hay acceso.
2. Crear a "María" con Taller=Recepcionista y POS=Cajero, y una sucursal. Se crea bien.
3. Cerrar sesión, entrar como María → **ve las dos tarjetas** y puede cambiar de sistema.
4. Editar a María y poner los dos en "Sin acceso" → el botón se deshabilita y aparece el aviso.
5. Editarla para dejarla solo con POS=Cajero → guarda. Al volver a entrar, María va **directo** al POS.
6. Crear a alguien con Taller="Sin acceso" y POS=Administrador → **no** debe pedir sucursal.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/src/app/(app)/settings/page.tsx"
git commit -m "Grant access to each system separately"
```

---

## Task 12: Pruebas de humo y cierre

**Files:**
- Modify: `scripts/pruebas-humo.sh`

- [ ] **Step 1: Añadir las comprobaciones de acceso por sistema**

En `scripts/pruebas-humo.sh`, añadir el inicio de sesión del cajero junto a los otros cuatro:

```bash
CAJ=$(login cajero@tallerdemo.com)
HC=(-H "Authorization: Bearer $CAJ" -H "X-Branch-Id: $BR_A")
```

Y una sección nueva antes de la de "MÓDULOS ELIMINADOS":

```bash
echo ""; echo "ACCESO POR SISTEMA"
check "el cajero entra" 200 "$(code -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"email":"cajero@tallerdemo.com","password":"Password123!"}')"
check "el cajero NO ve órdenes del taller" 403 "$(code $API/orders "${HC[@]}")"
check "el cajero NO ve cotizaciones" 403 "$(code $API/quotations "${HC[@]}")"
check "el cajero NO administra usuarios" 403 "$(code $API/users "${HC[@]}")"
check "el cajero SÍ ve sus sucursales" 200 "$(code $API/users/me/branches "${HC[@]}")"
POSROL=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"email":"cajero@tallerdemo.com","password":"Password123!"}' | grep -o '"posRole":"[^"]*"' | cut -d'"' -f4)
check "el login devuelve el rol de POS" CASHIER "$POSROL"
check "crear sin ningún sistema se rechaza" 400 "$(code -X POST $API/users "${HA[@]}" -H 'Content-Type: application/json' -d '{"email":"nadie'"$RANDOM"'@t.com","password":"Password123!","firstName":"N","lastName":"A","branchIds":["'"$BR_A"'"]}')"
```

- [ ] **Step 2: Correrlas**

```bash
bash scripts/pruebas-humo.sh
```

Esperado: **todas en verde**, las 44 que ya había más las 7 nuevas. Si `/orders` devuelve 200 en vez de 403 para el cajero, el `@Roles` de ese controlador no está exigiendo rol de taller — revisarlo antes de dar la fase por buena.

- [ ] **Step 3: Compilar todo y correr toda la suite**

```bash
cd apps/api && npx tsc --noEmit && npx jest
cd ../.. && pnpm --filter @taller/web build
```

Esperado: sin errores de tipos, todas las pruebas en verde, compilación del front correcta.

- [ ] **Step 4: Repaso manual final**

Recorrer la lista de la §8 del spec de punta a punta, con los tres usuarios (solo taller, solo POS, ambos). Anotar cualquier desviación en vez de arreglarla sobre la marcha si toca decisiones de diseño.

- [ ] **Step 5: Commit**

```bash
git add scripts/pruebas-humo.sh
git commit -m "Cover per-system access in the smoke test"
```

---

## Notas para quien implemente

**Lo que esta fase NO hace**, y no hay que dejarse llevar: no crea la base `motopos`, ni su cliente Prisma, ni una sola tabla de productos o ventas, ni un guard de roles del POS aplicado a endpoints del POS. `/pos` es una página que anuncia la Fase 2 y ya.

**Dos sitios donde es fácil equivocarse:**

1. `Role.ADMIN` y `PosRole.ADMIN` son **la misma cadena `'ADMIN'`**. Nunca compararlas contra la misma lista ni guardarlas en el mismo campo. La Task 3 existe casi entera por esto.
2. `role` sin valor es `null` en la base y en el DTO, pero **`undefined` significa "no lo toques"** en una edición parcial. `UsersService.update` los distingue a propósito (Task 4, paso 5); si se colapsan, editar el teléfono de alguien le borraría el rol.
