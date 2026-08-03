/*
  Warnings:

  - You are about to drop the column `batteryVoltage` on the `diagnoses` table. All the data in the column will be lost.
  - You are about to drop the column `controllerStatus` on the `diagnoses` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedCost` on the `diagnoses` table. All the data in the column will be lost.
  - You are about to drop the column `estimatedTimeHours` on the `diagnoses` table. All the data in the column will be lost.
  - You are about to drop the column `motorStatus` on the `diagnoses` table. All the data in the column will be lost.
  - You are about to drop the column `observations` on the `diagnoses` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "diagnoses" DROP COLUMN "batteryVoltage",
DROP COLUMN "controllerStatus",
DROP COLUMN "estimatedCost",
DROP COLUMN "estimatedTimeHours",
DROP COLUMN "motorStatus",
DROP COLUMN "observations",
ALTER COLUMN "faultFound" DROP NOT NULL;
