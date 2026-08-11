import { Queue, Worker } from "bullmq";
import { createDb } from "@repo/db";
import { PLATFORMS, parseAdaptersMode } from "@repo/core";
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

const TICK_QUEUE = "scheduler-tick";
const TICK_JOB = "find-due-schedules";
const TICK_EVERY_MS = 5 * 60 * 1000;

async function main(): Promise<void> {
  const mode = parseAdaptersMode(ADAPTERS_MODE_RAW);
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
        console.log(`[worker] scheduler tick started ${started.length} run(s)`);
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
          const responseId = await executeRunJob(db, job.data, mode);
          return { responseId };
        },
        { connection, limiter: PLATFORM_RATE_LIMITS[platform], concurrency: 4 },
      ),
  );

  for (const worker of [tickWorker, ...runWorkers]) {
    worker.on("failed", (job, error) => {
      console.error(`[worker] job ${job?.id ?? "?"} failed:`, error.message);
    });
  }

  console.log(
    `[worker] started · adapters=${mode} · tick every ${TICK_EVERY_MS / 1000}s · run queues: ${PLATFORMS.join(", ")}`,
  );

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] received ${signal}, shutting down`);

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
  console.error("[worker] fatal:", error);
  process.exit(1);
});
