#!/bin/bash
# Crea la segunda base de datos (motopos) la primera vez que arranca el volumen
# de PostgreSQL.
#
# Docker ejecuta automáticamente todo lo que haya en
# /docker-entrypoint-initdb.d/ SÓLO cuando el directorio de datos está vacío.
# Si el volumen ya existe, este script NO se ejecuta — por eso lleva
# `IF NOT EXISTS` en espíritu: crear la base a mano después es igual de válido.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    SELECT 'CREATE DATABASE motopos'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'motopos')\gexec
EOSQL

echo "Base de datos 'motopos' lista."
