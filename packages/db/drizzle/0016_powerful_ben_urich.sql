-- Одно расписание на клиента.
--
-- Дубликаты уже существуют там, где сохранение прошло дважды: каждый тик
-- заводил по прогону на каждое расписание, то есть удваивал расход и
-- измерения. Оставляем самое свежее — в нём последние настройки, — и
-- только после этого ставим ограничение.
DELETE FROM "run_schedules" a
USING "run_schedules" b
WHERE a."client_id" = b."client_id"
  AND (a."created_at", a."id") < (b."created_at", b."id");
--> statement-breakpoint
CREATE UNIQUE INDEX "run_schedules_client_idx" ON "run_schedules" USING btree ("client_id");
