import { index, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clients } from "./tenancy";
import { actions } from "./actions";

export const experimentStatusEnum = pgEnum("experiment_status", [
  "collecting",
  "ready",
  "inconclusive",
]);

export const experimentEventEnum = pgEnum("experiment_event", [
  "action_shipped",
  "indexed",
  "first_new_citation",
  "visibility_change",
  "note",
]);

export const confidenceEnum = pgEnum("confidence_level", ["low", "medium", "high"]);

/**
 * Эксперимент связывает действие с последующим изменением видимости.
 *
 * Это НЕ доказательство причинности — спек прямо запрещает такую подачу.
 * Это запись: что сделали, когда, и что происходило после, рядом с группой
 * сравнения. Отсюда и названия полей: estimated, а не proven.
 */
export const experiments = pgTable(
  "experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    actionId: uuid("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    /** Дата, от которой отсчитывается «после». Берётся из completed_at действия. */
    actionDate: timestamp("action_date", { withTimezone: true }).notNull(),
    baselineStart: timestamp("baseline_start", { withTimezone: true }).notNull(),
    baselineEnd: timestamp("baseline_end", { withTimezone: true }).notNull(),
    treatmentClusterIds: uuid("treatment_cluster_ids").array().notNull().default([]),
    /** Кластеры сравнения: те, которых действие не касалось. */
    controlClusterIds: uuid("control_cluster_ids").array().notNull().default([]),
    controlPromptIds: uuid("control_prompt_ids").array().notNull().default([]),
    status: experimentStatusEnum("status").notNull().default("collecting"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("experiments_client_idx").on(table.clientId),
    index("experiments_action_idx").on(table.actionId),
  ],
);

export const experimentEvents = pgTable(
  "experiment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    type: experimentEventEnum("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    note: text("note"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  },
  (table) => [index("experiment_events_experiment_idx").on(table.experimentId)],
);

export const experimentResults = pgTable("experiment_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  experimentId: uuid("experiment_id")
    .notNull()
    .references(() => experiments.id, { onDelete: "cascade" })
    .unique(),
  treatmentBefore: numeric("treatment_before", { precision: 5, scale: 1 }),
  treatmentAfter: numeric("treatment_after", { precision: 5, scale: 1 }),
  controlBefore: numeric("control_before", { precision: 5, scale: 1 }),
  controlAfter: numeric("control_after", { precision: 5, scale: 1 }),
  /** Оценка вклада в процентных пунктах. Именно оценка — см. комментарий выше. */
  incrementalPp: numeric("incremental_pp", { precision: 5, scale: 1 }),
  confidence: confidenceEnum("confidence").notNull().default("low"),
  /** Перечень наблюдений, на которых основана оценка. */
  evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Experiment = typeof experiments.$inferSelect;
export type NewExperiment = typeof experiments.$inferInsert;
export type ExperimentEvent = typeof experimentEvents.$inferSelect;
export type NewExperimentEvent = typeof experimentEvents.$inferInsert;
export type ExperimentResult = typeof experimentResults.$inferSelect;
export type NewExperimentResult = typeof experimentResults.$inferInsert;
