import { getAdapter, type AdaptersMode, type Platform } from "@repo/core";
import {
  createResponse,
  countResponsesByRun,
  finishRun,
  getRunById,
  getRunSchedule,
  listActivePromptsForClient,
  startRun,
  updateResponseStorageKey,
} from "@repo/db";
import type { Database } from "@repo/db";
import { rawResponseKey, storage } from "./storage";
import { storeCitations } from "./parse-job";

export interface RunJobSpec {
  runId: string;
  promptId: string;
  promptText: string;
  platform: Platform;
  sampleIndex: number;
}

/**
 * Разворачивает прогон в отдельные единицы работы: промпт × платформа × повтор.
 * Чистая функция — считается и проверяется без БД и без сети.
 *
 * Повторы обязательны: ответы моделей стохастичны, и visibility по одному
 * ответу — это не измерение, а монетка (контракт C3).
 */
export function planRunJobs(
  runId: string,
  prompts: { id: string; text: string }[],
  platforms: readonly Platform[],
  samplesPerPrompt: number,
): RunJobSpec[] {
  if (samplesPerPrompt < 1) {
    throw new Error(`samplesPerPrompt must be >= 1, got ${samplesPerPrompt}`);
  }

  const jobs: RunJobSpec[] = [];
  for (const prompt of prompts) {
    for (const platform of platforms) {
      for (let sampleIndex = 0; sampleIndex < samplesPerPrompt; sampleIndex++) {
        jobs.push({ runId, promptId: prompt.id, promptText: prompt.text, platform, sampleIndex });
      }
    }
  }
  return jobs;
}

/** Выполняет одну единицу работы: вызов адаптера + запись ответа. */
export async function executeRunJob(
  db: Database,
  job: RunJobSpec,
  mode: AdaptersMode = "mock",
): Promise<string> {
  const adapter = getAdapter(job.platform, mode);
  const result = await adapter.execute(job.promptText);

  const response = await createResponse(db, {
    runId: job.runId,
    promptId: job.promptId,
    platform: job.platform,
    modelVersion: result.modelVersion,
    sampleIndex: job.sampleIndex,
    rawText: result.text,
    latencyMs: Math.round(result.latencyMs),
    // numeric в Postgres принимает строку — иначе теряется точность на дробных центах.
    costUsd: result.costUsd.toFixed(6),
  });

  // Сырой ответ дублируется в storage: парсер со временем меняется,
  // и переобрабатывать нужно оригинал, а не то, что он разобрал (инвариант 6).
  // Ключ проставляется только после успешной записи файла — иначе в БД
  // осталась бы ссылка на несуществующий объект.
  const key = rawResponseKey(job.runId, response.id);
  await storage.put(key, new TextEncoder().encode(result.text), "text/plain; charset=utf-8");
  await updateResponseStorageKey(db, response.id, key);

  // Ссылки приходят от платформы вместе с ответом и дальше нигде не восстановимы,
  // поэтому раскладываются сразу; упоминания разбирает ParseJob.
  await storeCitations(db, response.id, result.citations);

  return response.id;
}

export interface RunOutcome {
  runId: string;
  expected: number;
  written: number;
  failed: number;
  status: "done" | "failed";
}

/**
 * Полный прогон последовательно, без очередей. Используется тестами и ручным запуском;
 * в проде те же единицы работы раскладываются по очередям BullMQ.
 */
export async function orchestrateRun(
  db: Database,
  runId: string,
  mode: AdaptersMode = "mock",
): Promise<RunOutcome> {
  const run = await getRunById(db, runId);
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  const schedule = run.scheduleId ? await getRunSchedule(db, run.scheduleId) : undefined;
  const platforms = (schedule?.platforms ?? ["chatgpt"]) as Platform[];
  const samples = schedule?.samplesPerPrompt ?? 3;

  const prompts = await listActivePromptsForClient(db, run.clientId);
  const jobs = planRunJobs(runId, prompts, platforms, samples);

  await startRun(db, runId);

  let failed = 0;
  for (const job of jobs) {
    try {
      await executeRunJob(db, job, mode);
    } catch (error) {
      failed++;
      console.error(`[worker] job failed (${job.platform}, sample ${job.sampleIndex}):`, error);
    }
  }

  const written = await countResponsesByRun(db, runId);
  // Частичный успех всё равно помечается failed: агентство должно видеть,
  // что окно измерения неполное, а не считать долю по обрезанной выборке.
  const status = failed === 0 ? "done" : "failed";
  await finishRun(db, runId, status);

  return { runId, expected: jobs.length, written, failed, status };
}
