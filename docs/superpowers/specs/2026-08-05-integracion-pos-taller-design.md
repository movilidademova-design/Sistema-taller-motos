# Integración MotoPos ↔ Taller — Diseño

**Fecha:** 2026-08-05
**Alcance de este documento:** la arquitectura completa de la integración, y el detalle implementable de la **Fase 1**. Las fases 2 a 4 se describen a nivel de intención; cada una tendrá su propio spec.

---

## 1. Contexto

Existen hoy dos sistemas sin ninguna relación técnica entre sí:

| | Taller | MotoPos |
|---|---|---|
| Backend | NestJS 11 (TypeScript) | Flask 3 (Python), 1 archivo de 1.596 líneas |
| Base de datos | PostgreSQL + Prisma | SQLite (`motopos.db`) |
| Frontend | Next.js 16 + React 19, shadcn/ui | 1 archivo HTML de 2.997 líneas, JS a mano |
| Sesión | JWT (access + refresh) | cookie de sesión de Flask |
| Estructura | multi-empresa (`tenantId`) + multi-sucursal (`branchId`) | tienda única, sin sucursales |
| Paleta | grises sin saturación (`oklch(L 0 0)`) | naranja Mobulaa `#F26522` + verde/morado/rojo |

MotoPos corre local en Windows con `INICIAR_MOTOPOS.bat` y contiene datos reales: 63 productos, 22 ventas, 5 separados con 8 abonos, 4 usuarios.

**Objetivo:** un solo sistema en la nube donde, tras un único inicio de sesión, el usuario elige entre Taller y POS; con administración de accesos unificada, apariencia unificada, y **aislamiento total de los datos de negocio entre los dos**.

---

## 2. Decisiones tomadas

Estas decisiones las tomó el usuario durante el diseño y son la base de todo lo demás.

1. **Se reescribe MotoPos dentro del monorepo** (NestJS + Next.js + PostgreSQL). No se mantiene Flask.
2. **Una sola cuenta por persona, con un rol independiente en cada sistema.**
3. **El POS se divide por sucursal**, igual que el taller: inventario, caja y consecutivos propios por sucursal.
4. **El panel administrativo común gobierna accesos, no consolida dinero.** Ningún número del POS aparece junto a ningún número del taller.
5. **Diseño:** se conserva la base gris del taller y el naranja Mobulaa pasa a ser el color de marca de ambos sistemas.
6. **El POS nuevo arranca vacío.** No se migra ningún dato de `motopos.db`.
7. **Se elimina el módulo de gastos.** Cero registros en meses de uso.
8. **Las ventas del POS y los cobros del taller son operaciones separadas.** El taller no descuenta stock del POS ni cobra en la misma factura.
9. **Construcción en 4 fases**, empezando por la puerta de entrada.

---

## 3. Arquitectura general

### 3.1 Dos bases de datos

Dos bases de PostgreSQL **distintas, en el mismo servidor**:

- **`taller`** — la que ya existe.
- **`motopos`** — nueva, se crea en la Fase 2.

Un solo servidor de base de datos que pagar y que respaldar, pero aislamiento real: son bases separadas, así que **ninguna consulta puede unir una venta del POS con una orden del taller**. No es una regla que haya que recordar respetar; es algo que no se puede escribir.

En código son dos clientes Prisma generados por separado, con dos `schema.prisma`, dos cadenas de conexión (`DATABASE_URL` y `POS_DATABASE_URL`) y dos comandos de migración independientes.

### 3.2 La identidad es lo único compartido

La base `taller` es la autoridad sobre **quién es quién**. Ahí viven `Tenant`, `Branch`, `User` y `UserBranch`.

La base `motopos` guarda ventas, productos y separados. Cuando necesita registrar quién vendió o en qué sucursal, guarda `userId`, `branchId` y `tenantId` **como texto plano, sin llave foránea** — no puede haberla, son bases distintas. Para mostrar el nombre de quien vendió, el POS le pregunta al módulo de identidad.

Esta es la única grieta en el aislamiento y es deliberada: sin ella no hay un solo inicio de sesión.

### 3.3 Qué cruza y qué no

| Cruza | No cruza |
|---|---|
| Nombre, correo, contraseña | Clientes del taller |
| Empresa y sucursales | Órdenes, cotizaciones, facturas del taller |
| A qué sistema tiene acceso cada persona | Productos, ventas, separados del POS |
| | Inventario de cualquiera de los dos |

Consecuencia aceptada: el catálogo de productos del POS y el inventario de repuestos del taller son **dos inventarios separados**. Si un artículo se vende en los dos lados, existe dos veces. Fue una decisión explícita (decisión 8).

### 3.4 Las cuatro fases

| Fase | Qué queda funcionando |
|---|---|
| **F1** (este spec) | Login único, selector de sistema, cambio de un clic, roles por sistema, panel de accesos, diseño unificado |
| F2 | Base `motopos`, productos, listas, vender, anular, nota crédito |
| F3 | Separados con abonos y recibos numerados |
| F4 | Reportes, exportaciones y cierre mensual |

**La Fase 1 no crea la base `motopos` ni una sola tabla de ventas.** Construye la puerta y unifica la apariencia. Es pequeña y verificable, y permite validar el diseño visual antes de construir encima.

Valor de la F1 por sí sola, aunque el POS nunca llegara: hoy un empleado que trabaja en los dos lados se crea dos veces, en dos sistemas, con dos contraseñas que se desincronizan. Pasa a crearse una sola vez.

---

## 4. Fase 1 — detalle

### 4.1 Modelo de datos: un rol por sistema

En `apps/api/prisma/schema.prisma`:

```prisma
enum PosRole {
  ADMIN
  CASHIER
}

model User {
  // ...
  role    Role?     // null = sin acceso al Taller
  posRole PosRole?  // null = sin acceso al POS
  // ...
}
```

Dos cambios sobre lo que existe hoy:

1. **`role` pasa a ser opcional.** Hoy es obligatorio con `@default(RECEPTIONIST)`. Un cajero que solo usa el POS no debe tener ningún rol en el taller — si lo tuviera, vería órdenes que no le corresponden.
2. **Se agrega `posRole`**, opcional. Los dos valores salen de MotoPos: `admin` (todo) y `cajero` (solo ventas), traducidos a la convención del código, que está en inglés.

**Regla invariante: nadie puede quedar con los dos roles vacíos.** Sería una cuenta que puede iniciar sesión pero no puede ir a ninguna parte. Se impone en dos lugares:

- Validación en `UsersService.create` y `UsersService.update`, que devuelve 400 con el mensaje *"El usuario debe tener acceso al menos a un sistema."*
- Restricción `CHECK` en la migración SQL, para que ni un script ni una consulta manual puedan dejar una fila así:

```sql
ALTER TABLE users ADD CONSTRAINT users_at_least_one_role
  CHECK (role IS NOT NULL OR "posRole" IS NOT NULL);
```

**Migración de los usuarios existentes:** todos conservan su `role` actual y quedan con `posRole = NULL`. Nadie gana acceso al POS automáticamente; el administrador lo asigna a mano. Los 4 usuarios de `motopos.db` (admin, cajero, Joseph, Leonardo) **no se importan** — son de la base que no se migra (decisión 6).

### 4.2 Efectos sobre el alcance por sucursal

`UsersService.findMyBranches` hoy decide con `role === ADMIN`: un administrador ve todas las sucursales, los demás solo las suyas.

Con dos roles, la regla pasa a ser: **ve todas las sucursales quien sea ADMIN en cualquiera de los dos sistemas.** Un administrador del POS que no tiene rol en el taller igual necesita ver todas las sucursales para administrar sus cajas.

`UserBranch` sigue siendo el mecanismo de asignación y no cambia: es infraestructura de identidad, no de negocio, así que sirve a los dos sistemas.

### 4.3 Autenticación

- El payload del JWT pasa de `{ sub, tenantId, email, role }` a `{ sub, tenantId, email, role, posRole }`. Afecta a los tres puntos que lo emiten en `AuthService`: registro de empresa, login y refresco.
- La respuesta de login y la de `/auth/me` incluyen `posRole`.
- **`RolesGuard` no necesita cambios de lógica**: `requiredRoles.includes(user.role)` con `role = null` da `false`, que es exactamente denegar. Solo cambia el tipo a `Role | null`.
- **No se agrega un guard para el POS en la F1.** No hay ni un endpoint del POS que proteger todavía. Se agregará en la F2 junto con los endpoints que lo necesiten.

### 4.4 Panel de accesos

Es la pantalla de usuarios que ya existe en Configuración, extendida:

- La tabla muestra **dos columnas de rol**, Taller y POS, en vez de una.
- El formulario de crear y editar tiene dos selectores, cada uno con una opción **"Sin acceso"**.
- Se conserva la regla que ya existe de que un Gerente no puede crear ni ascender a un Administrador, y se extiende al POS: **un Gerente tampoco puede otorgar el rol de Administrador del POS.**
- Solo lo ve quien es ADMIN en cualquiera de los dos sistemas.

No se crea ninguna pantalla nueva: es la misma, con más columnas. Sucursales y datos de la empresa se quedan donde están.

### 4.5 Selector de sistema

**Al iniciar sesión:**

- Con acceso a los dos → pantalla con dos tarjetas grandes, Taller y POS.
- Con acceso a uno solo → entra directo a ese sistema. No se muestra una pantalla cuyo único propósito sería hacer clic en el único botón disponible.

Hoy `apps/web/src/app/page.tsx` redirige siempre a `/dashboard`; pasa a aplicar esta decisión.

**Cambio entre sistemas:** un control en la barra superior, siempre visible, junto al selector de sucursal. Un clic, sin cerrar sesión, sin volver a la pantalla de entrada. Es un requisito, no un lujo: una recepcionista de una tienda que además tiene taller salta entre los dos decenas de veces al día, y obligarla a pasar por una pantalla intermedia cada vez sería un peaje.

Quien tiene acceso a un solo sistema no ve este control.

**Menú lateral:** `NAV_ITEMS` se divide en `TALLER_NAV` (los 12 elementos actuales) y `POS_NAV`. El menú que se muestra depende del sistema activo.

**Sucursal al cruzar:** la sucursal seleccionada se conserva. Si estabas en Calle 80 en el taller, llegas al POS en Calle 80. `X-Branch-Id` y su almacenamiento no cambian.

**Qué hay detrás del botón del POS en la F1:** una sola página en `/pos` que dice que el módulo llega en la siguiente fase. Es honesto y son 10 líneas. No se construye un POS de mentiras para llenar el hueco.

### 4.6 Diseño unificado

El taller usa hoy colores con saturación **cero** (`oklch(0.205 0 0)`). Eso significa que darle color de marca al sistema entero es cambiar unas pocas variables en `apps/web/src/app/globals.css`, no repintar 100 pantallas.

**Color de marca:** `#F26522` (naranja Mobulaa) = `oklch(0.676 0.189 42.04)`. Reemplaza a `--primary` en los temas claro y oscuro, y a `--ring` para que el foco del teclado combine.

**Hallazgo de accesibilidad, y por qué cambia el diseño:**

> `#F26522` con **letra blanca** encima da **3,15:1** de contraste. El mínimo aceptable para texto normal es 4,5:1. En una pantalla de caja, con reflejo o con alguien de afán, un botón "Cobrar" que no se lee bien es un error de venta.

La solución no es cambiar el naranja: es **letra oscura sobre el naranja** en vez de blanca. `--primary-foreground` pasa a `oklch(0.145 0 0)` — un valor que ya existe en el archivo, equivalente a `#0A0A0A` — y el contraste sube a **6,28:1**, que pasa AA con margen y queda cerca de AAA. Además negro sobre naranja es la identidad Mobulaa, así que se conserva el naranja exacto y se ve mejor.

Las tres cifras de contraste de este documento están calculadas con la fórmula de luminancia relativa de la WCAG, no estimadas a ojo.

**Lo que no cambia:**

- Fondos, tarjetas, bordes y tablas siguen en los grises actuales. El taller tiene tablas densas y formularios largos; saturarlos cansa la vista.
- Los colores con significado se quedan: verde pagado, rojo anulado, ámbar stock bajo. No son decoración, son información.

**Punto a verificar a ojo durante la implementación:** `--destructive` es `oklch(0.577 0.245 27.325)`, un rojo a 27° de matiz, y el naranja nuevo está a 42,5°. Están a 15° de distancia. Se diferencian bien porque además la claridad es distinta (0,677 contra 0,577), pero hay que confirmar en pantalla que un botón principal naranja y uno destructivo rojo no se confunden cuando quedan lado a lado.

**El POS hereda el diseño gratis.** Como se reconstruye con los mismos componentes de shadcn/ui, en las fases 2, 3 y 4 no hay trabajo de diseño: sale igualado solo. Este es el beneficio concreto de haber elegido reescribir en vez de mantener Flask.

### 4.7 La carpeta `motopos/`

Se conserva en el disco como **archivo de referencia y respaldo histórico**: contiene `motopos.db` con las ventas reales y el `.bat` para consultarlas si hace falta. Tiene su propio repositorio git anidado.

Se agrega `motopos/` a `.gitignore` del monorepo. No forma parte de la compilación ni del despliegue, y su `.git` anidado no debe mezclarse con el del monorepo. Durante las fases 2 a 4 se lee `app.py` como especificación de la lógica de negocio a replicar.

---

## 5. Fuera del alcance de la Fase 1

- La base de datos `motopos` y su cliente Prisma.
- Cualquier tabla, endpoint o pantalla de productos, ventas, separados, reportes o cierre.
- El guard de roles del POS.
- Importar datos de `motopos.db`.
- Consolidar cifras de los dos sistemas en una sola vista (decisión 4: el panel común no mezcla dinero).

## 6. Decisiones aplazadas

**Los gastos y el cierre mensual (Fase 4).** Se verificó en `app.py`: la hoja `GASTOS` del Excel de cierre es en realidad la conciliación de efectivo — calcula el efectivo del mes a partir de ventas y abonos, y aparte imprime una sección con los gastos registrados. Esa sección hoy sale siempre vacía porque la tabla tiene cero filas.

Decisión por defecto para la F4: **la hoja conserva la sección `GASTOS` en blanco** para no alterar el formato que ya conoce el contador, pero no se construye pantalla para registrarlos. Si algún día hacen falta, se agrega entonces.

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Hacer `role` opcional toca 40 usos en la API y 10 en el front | El compilador de TypeScript los señala todos: `Role \| null` no compila donde se asumía `Role`. No hay forma de que uno pase inadvertido. |
| Un usuario queda sin acceso a ningún sistema | Doble barrera: validación en el servicio y restricción `CHECK` en la base. |
| El naranja de marca se confunde con el rojo de acciones destructivas | Verificación visual explícita durante la implementación (§4.6). |
| La reescritura del cierre mensual (F4) se desvía del formato contable | Se conservan `MODELO CIERRE.xlsx` y `04.CIERRE ABRIL BODEGA GRIS.xlsx` como referencia, y se compara celda por celda contra un cierre generado por el sistema viejo. Riesgo de la F4, se anota aquí para no perderlo. |

## 8. Cómo se verifica la Fase 1

1. **Pruebas unitarias** de `UsersService`: crear con solo rol de taller, solo rol de POS, ambos, y ninguno (debe fallar); un Gerente intentando otorgar ADMIN de POS (debe fallar).
2. **`scripts/pruebas-humo.sh`** se amplía: un usuario solo-POS recibe 403 en los endpoints del taller, y `/auth/me` devuelve los dos roles.
3. **Verificación manual en el navegador**, que es donde se juega el objetivo real de esta fase:
   - Un usuario con los dos accesos ve el selector y puede cambiar de sistema de un clic.
   - Un usuario con un solo acceso entra directo y no ve el control de cambio.
   - La sucursal se conserva al cruzar.
   - El naranja se ve bien y el botón destructivo sigue siendo distinguible.
