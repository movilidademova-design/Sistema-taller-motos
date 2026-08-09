// Config del CLI de Prisma para el esquema del POS (Prisma 7 ya no admite
// `url` dentro del datasource del .prisma; la URL de conexión para
// migrate/generate se pasa aquí). Se usa con --config al ejecutar los
// scripts pos:generate / pos:migrate, para no tocar el prisma.config.ts
// del taller ni mezclar las dos URLs de base de datos.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "schema.prisma",
  migrations: {
    path: "migrations",
  },
  datasource: {
    url: process.env["POS_DATABASE_URL"],
  },
});
