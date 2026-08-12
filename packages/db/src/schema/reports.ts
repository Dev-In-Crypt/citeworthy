import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clients } from "./tenancy";

export const reportStatusEnum = pgEnum("report_status", ["draft", "shared", "approved"]);

/**
 * Сгенерированный отчёт. Payload хранится целиком и неизменным:
 * клиент видел конкретные цифры на конкретную дату, и пересчёт задним числом
 * означал бы, что показанный документ больше не существует.
 */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    status: reportStatusEnum("status").notNull().default("draft"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    pdfStorageKey: text("pdf_storage_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("reports_client_idx").on(table.clientId)],
);

/**
 * Ссылка на отчёт для клиента агентства. Единственный анонимный доступ
 * в продукте (инвариант 1): read-only плюс кнопка approve, без регистрации —
 * требовать аккаунт от клиента агентства значит убить сам канал.
 */
export const reportShares = pgTable(
  "report_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByName: text("approved_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("report_shares_report_idx").on(table.reportId)],
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type ReportShare = typeof reportShares.$inferSelect;
