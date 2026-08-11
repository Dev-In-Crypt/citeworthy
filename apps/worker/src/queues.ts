import { Queue } from "bullmq";
import IORedis from "ioredis";
import { REDIS_URL } from "./env";

/** BullMQ требует maxRetriesPerRequest: null для блокирующих операций воркера. */
export function createConnection(): IORedis {
  return new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
}

export const QUEUE_NAMES = {
  runs: "runs",
  parse: "parse",
  aggregate: "aggregate",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface RunJobData {
  runId: string;
  promptId: string;
  platform: string;
  sampleIndex: number;
}

export interface ParseJobData {
  responseId: string;
}

export interface AggregateJobData {
  clientId: string;
  runId: string;
}

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

export function createQueues(connection: IORedis) {
  return {
    runs: new Queue<RunJobData>(QUEUE_NAMES.runs, { connection, defaultJobOptions }),
    parse: new Queue<ParseJobData>(QUEUE_NAMES.parse, { connection, defaultJobOptions }),
    aggregate: new Queue<AggregateJobData>(QUEUE_NAMES.aggregate, {
      connection,
      defaultJobOptions,
    }),
  };
}

export type Queues = ReturnType<typeof createQueues>;
