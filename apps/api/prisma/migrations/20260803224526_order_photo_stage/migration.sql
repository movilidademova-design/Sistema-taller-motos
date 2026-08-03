-- CreateEnum
CREATE TYPE "PhotoStage" AS ENUM ('INTAKE', 'WORK');

-- AlterTable: se agrega con DEFAULT para rellenar las filas existentes —
-- las 4 fotos que hay son todas de ingreso (su uploadedAt coincide con el
-- receivedAt de su orden) — y luego se quita el default para que todo insert
-- nuevo tenga que decir explícitamente de qué tipo es.
ALTER TABLE "order_photos" ADD COLUMN "stage" "PhotoStage" NOT NULL DEFAULT 'INTAKE';
ALTER TABLE "order_photos" ALTER COLUMN "stage" DROP DEFAULT;
