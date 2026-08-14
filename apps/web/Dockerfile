# ─────────────────────────────────────────────────────────────────────────────
# Frontend (Next.js) — imagen para staging y producción
#
# Se construye desde la RAÍZ del repositorio:
#   docker build -f apps/web/Dockerfile -t taller-web .
#
# ⚠️ IMPORTANTE: las variables NEXT_PUBLIC_* se INCRUSTAN AL COMPILAR, así que
# hay que pasarlas como --build-arg. Eso significa que quedan grabadas en la
# imagen — por eso SÓLO pueden ser URLs públicas, nunca secretos. Una imagen
# construida para staging NO sirve para producción: hay que reconstruirla con
# las URLs de producción.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --filter @taller/web... --filter .

COPY packages/shared packages/shared
COPY apps/web apps/web

# Las URLs se inyectan aquí. No son secretos: acaban en el JavaScript que
# descarga el navegador de todos modos.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL

WORKDIR /repo/apps/web
RUN pnpm exec next build

# ─────────────────────────────────────────────────────────────────────────────
# Imagen final
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# `standalone` trae ya sólo lo necesario para ejecutar: no hace falta copiar
# node_modules entero.
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /repo/apps/web/public ./apps/web/public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/login || exit 1

CMD ["node", "apps/web/server.js"]
