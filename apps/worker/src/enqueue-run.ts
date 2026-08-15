import type { FlowProducer } from "bullmq";
import { getRunById, getRunSchedule, listActivePromptsForClient, startRun } from "@repo/db";
import type { Database } from "@repo/db";
import { PLATFORMS } from "@repo/core";
import type { Platform } from "@repo/core";
import { planRunJobs } from "@repo/pipeline";
import { QUEUE_NAMES, runsQueueName, type FinalizeJobData, type RunJobData } from "./queues";

/**
 * Ставит задачи прогона в очереди платформ и вешает на них сборку.
 *
 * Flow, а не счётчик выполненных: сборка запускается тогда, когда доехали
 * все ответы, и это гарантирует очередь, а не наша арифметика. Считать
 * готовность самим значило бы однажды собрать прогон на половине данных.
 */
export async function enqueueRun(
  db: Database,
  flow: FlowProducer,
  runId: string,
  clientId: string,
): Promise<number> {
  const run = await getRunById(db, runId);
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  const schedule = run.scheduleId ? await getRunSchedule(db, run.scheduleId) : undefined;
  // Без расписания берётся весь набор платформ: молча измерить одну и
  // показать это как «видимость» хуже, чем потратить больше.
  const platforms = (schedule?.platforms ?? PLATFORMS) as Platform[];
  const samples = schedule?.samplesPerPrompt ?? 3;

  const prompts = await listActivePromptsForClient(db, clientId);
  const jobs = planRunJobs(runId, prompts, platforms, samples);

  if (jobs.length === 0) {
    return 0;
  }

  await startRun(db, runId);

  await flow.add({
    name: "finalize",
    queueName: QUEUE_NAMES.finalize,
    data: { runId, clientId, expected: jobs.length } satisfies FinalizeJobData,
    children: jobs.map((job) => ({
      name: `${job.platform}-${job.sampleIndex}`,
      queueName: runsQueueName(job.platform),
      data: job satisfies RunJobData,
    })),
  });

  return jobs.length;
}
