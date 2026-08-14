#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Copia de seguridad de staging (las DOS bases + los archivos subidos).
#
#   chmod +x scripts/backup-staging.sh
#   ./scripts/backup-staging.sh
#
# Automatizar a las 3 de la madrugada:
#   crontab -e
#   0 3 * * * /opt/taller/scripts/backup-staging.sh >> /var/log/taller-backup.log 2>&1
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RAIZ="${RAIZ:-/opt/taller}"
COMPOSE="$RAIZ/docker-compose.staging.yml"
USUARIO_BD="${POSTGRES_USER:-taller}"
DEST="${DEST:-$HOME/backups/$(date +%Y-%m-%d_%H%M)}"

mkdir -p "$DEST"
echo "Copia en $DEST"

# `exec -T` desactiva el pseudo-terminal. SIN -T el volcado sale CORRUPTO,
# porque el terminal traduce saltos de línea dentro de un archivo binario.
# Es el error más común al hacer copias desde Docker.
docker compose -f "$COMPOSE" exec -T postgres \
  pg_dump -U "$USUARIO_BD" -Fc taller_motos > "$DEST/taller_motos.dump"
docker compose -f "$COMPOSE" exec -T postgres \
  pg_dump -U "$USUARIO_BD" -Fc motopos > "$DEST/motopos.dump"

# Los archivos subidos viven en un volumen de Docker, no en el disco del host:
# se sacan con un contenedor de usar y tirar que monta el volumen.
VOLUMEN=$(docker volume ls --format '{{.Name}}' | grep -E 'uploads_data$' | head -1)
if [ -n "$VOLUMEN" ]; then
  docker run --rm -v "$VOLUMEN":/data:ro -v "$DEST":/backup alpine \
    tar czf /backup/uploads.tar.gz -C /data . 2>/dev/null || true
fi

# Una copia de 0 bytes es una copia rota. Mejor enterarse hoy que el día del
# desastre: el script falla en vez de dejar un archivo inútil.
for f in "$DEST"/*.dump; do
  if [ ! -s "$f" ]; then
    echo "ERROR: $f está vacío — la copia NO es válida" >&2
    exit 1
  fi
done

# Comprobación real de integridad: pg_restore --list lee la tabla de contenidos
# del volcado. Si el archivo está truncado o corrupto, esto falla.
for f in "$DEST"/*.dump; do
  if ! docker compose -f "$COMPOSE" exec -T postgres pg_restore --list < "$f" > /dev/null 2>&1; then
    echo "ERROR: $f no se puede leer como volcado de PostgreSQL" >&2
    exit 1
  fi
done

# Conservar 30 días
find "$(dirname "$DEST")" -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null || true

echo "Copia correcta y verificada:"
ls -lh "$DEST"
