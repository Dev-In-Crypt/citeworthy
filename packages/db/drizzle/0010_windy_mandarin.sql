-- Тип пересоздаётся, а не расширяется через ALTER TYPE ADD VALUE.
-- Postgres запрещает использовать значение, добавленное к существующему типу,
-- в той же транзакции, а мигратор гоняет все файлы одной транзакцией — поэтому
-- ADD VALUE + SET DEFAULT падали с check_safe_enum_use. На новый тип запрет
-- не распространяется.
ALTER TYPE "public"."cadence" RENAME TO "cadence_old";--> statement-breakpoint
CREATE TYPE "public"."cadence" AS ENUM('daily', 'weekly', 'biweekly');--> statement-breakpoint
ALTER TABLE "run_schedules" ALTER COLUMN "cadence" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "run_schedules" ALTER COLUMN "cadence" SET DATA TYPE "public"."cadence" USING "cadence"::text::"public"."cadence";--> statement-breakpoint
ALTER TABLE "run_schedules" ALTER COLUMN "cadence" SET DEFAULT 'biweekly';--> statement-breakpoint
DROP TYPE "public"."cadence_old";
