import { index, jsonb, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { agencies, clients, users } from "./tenancy";

export const activityEventEnum = pgEnum("activity_event", [
  "action_created",
  "action_status_changed",
  "action_completed",
  "run_finished",
  "report_generated",
  /** Отчёт отправлен клиенту агентства письмом — по явному действию человека. */
  "report_shared",
  "report_approved",
]);

/**
 * Журнал того, что происходило по клиенту.
 *
 * Из него собирается раздел «что было сделано» в клиентском отчёте, поэтому
 * запись должна появляться в момент события, а не восстанавливаться задним
 * числом по состоянию таблиц: состояние показывает «как сейчас», а агентству
 * нужно «что происходило за период».
 */
export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    /** null — событие сделано системой (прогон по расписанию), а не человеком. */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    eventType: activityEventEnum("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("activity_log_client_idx").on(table.clientId),
    index("activity_log_created_idx").on(table.createdAt),
  ],
);

export type ActivityEntry = typeof activityLog.$inferSelect;
export type NewActivityEntry = typeof activityLog.$inferInsert;
