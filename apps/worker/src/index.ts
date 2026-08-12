import { Queue, Worker } from "bullmq";
import { createDb } from "@repo/db";
import { PLATFORMS, parseAdaptersMode, registerLiveAdapters } from "@repo/core";
import { ADAPTERS_MODE_RAW } from "./env";
import {
  createConnection,
  createQueues,
  PLATFORM_RATE_LIMITS,
  runsQueueName,
  type RunJobData,
} from "./queues";
import { tickSchedules } from "./scheduler";
import { executeRunJob } from "@repo/pipeline";
import { errorReporter, logger } from "./observability";

const TICK_QUEUE = "scheduler-tick";
const TICK_JOB = "find-due-schedules";
const TICK_EVERY_MS = 5 * 60 * 1000;

async function main(): Promise<void> {
  const mode = parseAdaptersMode(ADAPTERS_MODE_RAW);

  if (mode === "live") {
    const platforms = registerLiveAdapters();
    logger.info("adapters.live_registered", { platforms });
  }
  const connection = createConnection();
  const { db, close: closeDb } = createDb();
  const queues = createQueues(connection);

  const tickQueue = new Queue(TICK_QUEUE, { connection });
  await tickQueue.upsertJobScheduler(TICK_JOB, { every: TICK_EVERY_MS });

  const tickWorker = new Worker(
    TICK_QUEUE,
    async () => {
      const started = await tickSchedules(db);
      if (started.length > 0) {
        logger.info("scheduler.tick", {
          startedRuns: started.length,
          runIds: started.map((result) => result.runId),
        });
      }
      return { started: started.length };
    },
    { connection },
  );

  // По воркеру на платформу: свой лимит частоты у каждого провайдера.
  const runWorkers = PLATFORMS.map(
    (platform) =>
      new Worker<RunJobData>(
        runsQueueName(platform),
        async (job) => {
          const startedAt = Date.now();
          const responseId = await executeRunJob(db, job.data, mode);
          logger.info("run.job_completed", {
            platform,
            runId: job.data.runId,
            promptId: job.data.promptId,
            sampleIndex: job.data.sampleIndex,
            responseId,
            durationMs: Date.now() - startedAt,
          });
          return { responseId };
        },
        { connection, limiter: PLATFORM_RATE_LIMITS[platform], concurrency: 4 },
      ),
  );

  for (const worker of [tickWorker, ...runWorkers]) {
    worker.on("failed", (job, error) => {
      // Упавшая задача — единственное место, где теряются измерения:
      // она должна доехать до Sentry, а не остаться строкой в консоли.
      errorReporter.captureError(error, {
        scope: "worker.job",
        queue: worker.name,
        jobId: job?.id,
        attemptsMade: job?.attemptsMade,
        data: job?.data,
      });
    });
  }

  logger.info("worker.started", {
    adapters: mode,
    tickEverySec: TICK_EVERY_MS / 1000,
    runQueues: PLATFORMS,
  });

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("worker.shutdown", { signal });

    await Promise.all([tickWorker.close(), ...runWorkers.map((w) => w.close())]);
    await Promise.all([
      tickQueue.close(),
      queues.runs.close(),
      queues.parse.close(),
      queues.aggregate.close(),
    ]);
    await closeDb();
    connection.disconnect();
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  errorReporter.captureError(error, { scope: "worker.startup" });
  process.exit(1);
});
