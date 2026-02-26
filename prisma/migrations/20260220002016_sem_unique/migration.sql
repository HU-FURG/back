/*
  Warnings:

  - The values [exelente] on the enum `availabilityStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "availabilityStatus_new" AS ENUM ('ok', 'bom', 'excelente');
ALTER TABLE "public"."PeriodReportDaily" ALTER COLUMN "availabilityStatus" DROP DEFAULT;
ALTER TABLE "public"."RoomPeriod" ALTER COLUMN "availabilityStatus" DROP DEFAULT;
ALTER TABLE "RoomPeriod" ALTER COLUMN "availabilityStatus" TYPE "availabilityStatus_new" USING ("availabilityStatus"::text::"availabilityStatus_new");
ALTER TABLE "PeriodReportDaily" ALTER COLUMN "availabilityStatus" TYPE "availabilityStatus_new" USING ("availabilityStatus"::text::"availabilityStatus_new");
ALTER TYPE "availabilityStatus" RENAME TO "availabilityStatus_old";
ALTER TYPE "availabilityStatus_new" RENAME TO "availabilityStatus";
DROP TYPE "public"."availabilityStatus_old";
ALTER TABLE "PeriodReportDaily" ALTER COLUMN "availabilityStatus" SET DEFAULT 'ok';
ALTER TABLE "RoomPeriod" ALTER COLUMN "availabilityStatus" SET DEFAULT 'ok';
COMMIT;

-- DropIndex
DROP INDEX "MapRoom_mapId_svgElementId_key";

-- DropIndex
DROP INDEX "MapRoom_roomId_key";
