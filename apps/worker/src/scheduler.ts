import { createRun, listDueSchedules, setScheduleNextRun } from "@repo/db";
import type { Database } from "@repo/db";

/** Чистый расчёт следующего запуска — тестируется без БД. */
export function nextRunAfter(cadence: "daily" | "weekly", from: Date): Date {
  const days = cadence === "daily" ? 1 : 7;
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export interface TickResult {
  scheduleId: string;
  runId: string;
  clientId: string;
}

/**
 * Один тик планировщика: находит созревшие расписания, создаёт по прогону
 * и сдвигает next_run_at. Сдвиг выполняется сразу после создания прогона,
 * иначе следующий тик подхватил бы то же расписание повторно.
 */
export async function tickSchedules(db: Database, now: Date = new Date()): Promise<TickResult[]> {
  const due = await listDueSchedules(db, now);
  const results: TickResult[] = [];

  for (const schedule of due) {
    const run = await createRun(db, {
      scheduleId: schedule.id,
      clientId: schedule.clientId,
      status: "pending",
      trigger: "scheduled",
    });

    await setScheduleNextRun(db, schedule.id, nextRunAfter(schedule.cadence, now));

    results.push({ scheduleId: schedule.id, runId: run.id, clientId: schedule.clientId });
  }

  return results;
}
