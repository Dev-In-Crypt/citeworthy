import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { clients } from "./tenancy";

/** Интент кластера определяет, какой формат ответа вообще может процитировать модель. */
export const promptIntentEnum = pgEnum("prompt_intent", [
  "learning",
  "comparison",
  "purchase",
  "other",
]);

export const platformEnum = pgEnum("platform", ["chatgpt", "perplexity", "gemini"]);
export const cadenceEnum = pgEnum("cadence", ["daily", "weekly"]);
export const runStatusEnum = pgEnum("run_status", ["pending", "running", "done", "failed"]);
export const runTriggerEnum = pgEnum("run_trigger", ["scheduled", "manual"]);
export const sentimentEnum = pgEnum("sentiment", ["positive", "neutral", "negative"]);
export const entityTypeEnum = pgEnum("entity_type", ["client", "competitor", "other"]);

export const promptClusters = pgTable(
  "prompt_clusters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    intent: promptIntentEnum("intent").notNull().default("other"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("prompt_clusters_client_id_idx").on(table.clientId)],
);

export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clusterId: uuid("cluster_id")
      .notNull()
      .references(() => promptClusters.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    /** Контрольные промпты не затрагиваются действиями — база сравнения для экспериментов (T43). */
    isControl: boolean("is_control").notNull().default(false),
    language: text("language").notNull().default("en"),
    geo: text("geo").notNull().default("us"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("prompts_cluster_id_idx").on(table.clusterId)],
);

export const runSchedules = pgTable(
  "run_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    cadence: cadenceEnum("cadence").notNull().default("weekly"),
    platforms: platformEnum("platforms").array().notNull().default(["chatgpt"]),
    /**
     * Повторные прогоны одного промпта: ответы моделей стохастичны,
     * visibility считается по доле, а не по одному ответу (контракт C3).
     */
    samplesPerPrompt: integer("samples_per_prompt").notNull().default(3),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("run_schedules_next_run_at_idx").on(table.nextRunAt)],
);

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scheduleId: uuid("schedule_id").references(() => runSchedules.id, { onDelete: "set null" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    status: runStatusEnum("status").notNull().default("pending"),
    trigger: runTriggerEnum("trigger").notNull().default("scheduled"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [index("runs_client_id_idx").on(table.clientId)],
);

export const responses = pgTable(
  "responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    modelVersion: text("model_version").notNull(),
    /** Номер повтора внутри прогона: 0..samplesPerPrompt-1. */
    sampleIndex: integer("sample_index").notNull().default(0),
    rawText: text("raw_text").notNull(),
    /** Сырой ответ дублируется в storage — нужен для переобработки парсером (инвариант 6). */
    rawStorageKey: text("raw_storage_key"),
    latencyMs: integer("latency_ms"),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("responses_run_id_idx").on(table.runId),
    index("responses_prompt_id_idx").on(table.promptId),
    // Повтор одного и того же сэмпла в рамках прогона — всегда ошибка оркестрации.
    uniqueIndex("responses_unique_sample_idx").on(
      table.runId,
      table.promptId,
      table.platform,
      table.sampleIndex,
    ),
  ],
);

export const mentions = pgTable(
  "mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => responses.id, { onDelete: "cascade" }),
    entityType: entityTypeEnum("entity_type").notNull().default("other"),
    entityName: text("entity_name").notNull(),
    /** 1-based порядок появления в ответе. */
    position: integer("position").notNull(),
    sentiment: sentimentEnum("sentiment").notNull().default("neutral"),
    isClient: boolean("is_client").notNull().default(false),
    isCompetitor: boolean("is_competitor").notNull().default(false),
  },
  (table) => [index("mentions_response_id_idx").on(table.responseId)],
);

export const citations = pgTable(
  "citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => responses.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    title: text("title"),
    position: integer("position").notNull().default(1),
  },
  (table) => [
    index("citations_response_id_idx").on(table.responseId),
    index("citations_domain_idx").on(table.domain),
  ],
);

export const promptClustersRelations = relations(promptClusters, ({ one, many }) => ({
  client: one(clients, { fields: [promptClusters.clientId], references: [clients.id] }),
  prompts: many(prompts),
}));

export const promptsRelations = relations(prompts, ({ one }) => ({
  cluster: one(promptClusters, {
    fields: [prompts.clusterId],
    references: [promptClusters.id],
  }),
}));

export const runsRelations = relations(runs, ({ one, many }) => ({
  client: one(clients, { fields: [runs.clientId], references: [clients.id] }),
  responses: many(responses),
}));

export const responsesRelations = relations(responses, ({ one, many }) => ({
  run: one(runs, { fields: [responses.runId], references: [runs.id] }),
  prompt: one(prompts, { fields: [responses.promptId], references: [prompts.id] }),
  mentions: many(mentions),
  citations: many(citations),
}));

export type PromptCluster = typeof promptClusters.$inferSelect;
export type NewPromptCluster = typeof promptClusters.$inferInsert;
export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;
export type RunSchedule = typeof runSchedules.$inferSelect;
export type NewRunSchedule = typeof runSchedules.$inferInsert;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type Response = typeof responses.$inferSelect;
export type NewResponse = typeof responses.$inferInsert;
export type Mention = typeof mentions.$inferSelect;
export type NewMention = typeof mentions.$inferInsert;
export type Citation = typeof citations.$inferSelect;
export type NewCitation = typeof citations.$inferInsert;
