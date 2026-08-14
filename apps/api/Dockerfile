# ─────────────────────────────────────────────────────────────────────────────
# API (NestJS) — imagen para staging y producción
#
# Se construye desde la RAÍZ del repositorio, no desde apps/api, porque esto es
# un monorepo pnpm y hacen falta el pnpm-workspace.yaml y el lockfile:
#
#   docker build -f apps/api/Dockerfile -t taller-api .
#
# NO contiene ningún secreto. Las variables se pasan al ejecutar.
# ─────────────────────────────────────────────────────────────────────────────

# `slim` (Debian) en vez de `alpine` a propósito: argon2 y Prisma son módulos
# nativos con binarios precompilados para glibc. En alpine (musl) habría que
# compilarlos dentro de la imagen, lo que alarga la construcción y añade fallos
# que no aportan nada.
FROM node:20-slim AS builder

# openssl lo necesita Prisma para su motor de consultas.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

# Primero sólo los manifiestos: si no cambian, Docker reutiliza la capa de
# dependencias y la reconstrucción baja de minutos a segundos.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --filter @taller/api... --filter .

# Ahora el código
COPY packages/shared packages/shared
COPY apps/api apps/api

WORKDIR /repo/apps/api

# Los clientes de Prisma se generan durante la construcción: son código, no
# datos, y no necesitan conexión a ninguna base.
RUN pnpm prisma generate \
    && pnpm prisma generate --config prisma/pos/prisma.config.ts \
    && pnpm exec nest build

# ─────────────────────────────────────────────────────────────────────────────
# Imagen final
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends openssl curl \
    && rm -rf /var/lib/apt/lists/*

# Usuario sin privilegios: si alguien compromete la aplicación, no es root
# dentro del contenedor. La imagen de Node ya trae el usuario `node`.
ENV NODE_ENV=production
WORKDIR /repo

COPY --from=builder --chown=node:node /repo/node_modules ./node_modules
COPY --from=builder --chown=node:node /repo/packages ./packages
COPY --from=builder --chown=node:node /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=node:node /repo/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=node:node /repo/apps/api/prisma ./apps/api/prisma
COPY --from=builder --chown=node:node /repo/apps/api/package.json ./apps/api/package.json
# `prisma.config.ts` es de dónde saca el CLI la URL de la base. Sin él,
# `npx prisma migrate deploy` dentro del contenedor falla con
# «The datasource.url property is required in your Prisma config file».
# Comprobado: el procedimiento de migraciones documentado no funcionaba.
COPY --from=builder --chown=node:node /repo/apps/api/prisma.config.ts ./apps/api/prisma.config.ts

# Carpeta de archivos subidos. En staging y producción se monta un volumen
# encima: si no, las fotos desaparecen en cada despliegue.
RUN mkdir -p /repo/apps/api/uploads && chown -R node:node /repo/apps/api/uploads

USER node
WORKDIR /repo/apps/api
EXPOSE 3001

# El contenedor se declara enfermo si /api/health deja de responder, y Docker
# lo reinicia. `start-period` da margen a que Prisma conecte al arrancar.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD curl -fsS http://localhost:3001/api/health || exit 1

# Ruta real del punto de entrada: dist/src/main.js, no dist/main.js.
# La compilación incluye ficheros de fuera de src/ y eso desplaza el árbol.
CMD ["node", "dist/src/main.js"]
