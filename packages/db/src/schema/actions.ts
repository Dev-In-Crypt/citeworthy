import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clients, users } from "./tenancy";
import { sources } from "./sources";

export const actionTypeEnum = pgEnum("action_type", [
  "refresh_page",
  "create_page",
  "technical_fix",
  "structured_data_fix",
  "crawler_fix",
  "source_outreach",
  "review_platform",
  "pr_editorial",
  "ugc_community",
  "product_data_update",
]);

export const actionStatusEnum = pgEnum("action_status", [
  "backlog",
  "in_progress",
  "done",
  "dropped",
]);

export const impactEnum = pgEnum("impact_level", ["low", "medium", "high"]);

/**
 * Действие — единица работы агентства и вход в единственный накапливаемый
 * датасет продукта: что сделали и что за этим последовало.
 *
 * `reason` NOT NULL намеренно: принцип 6 спека — каждая рекомендация объясняет
 * «почему». Действие без объяснения нельзя ни защитить перед клиентом,
 * ни осмысленно связать с результатом через полгода.
 */
export const actions = pgTable(
  "actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    actionType: actionTypeEnum("action_type").notNull(),
    /** Источник, к которому относится действие (для outreach-типов). */
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    sourceDomain: text("source_domain"),
    /** Кластеры, на которые действие рассчитано — база для treatment в эксперименте. */
    affectedClusterIds: uuid("affected_cluster_ids").array().notNull().default([]),
    estimatedImpact: impactEnum("estimated_impact").notNull().default("medium"),
    effort: impactEnum("effort").notNull().default("medium"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    status: actionStatusEnum("status").notNull().default("backlog"),
    /** Правило-источник рекомендации; null — действие заведено вручную. */
    originRule: text("origin_rule"),
    /**
     * Числа, на которых стояла рекомендация: доля цитирований источника,
     * сколько раз он процитирован, кто из конкурентов там присутствует.
     * Раньше они жили только внутри текста `reason` — прочитать можно,
     * собрать из них рабочее задание или сверить результат нельзя.
     */
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("actions_client_idx").on(table.clientId),
    index("actions_status_idx").on(table.status),
  ],
);

export type Action = typeof actions.$inferSelect;
export type NewAction = typeof actions.$inferInsert;
