-- AlterTable
ALTER TABLE "public"."PeriodHistory" ADD COLUMN     "endService" TIMESTAMP(3),
ADD COLUMN     "startService" TIMESTAMP(3),
ADD COLUMN     "used" BOOLEAN NOT NULL DEFAULT false;
