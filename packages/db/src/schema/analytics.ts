import { date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { clients } from "./tenancy";

/**
 * Переходы от ассистентов по дням.
 *
 * Отдельная таблица, а не поле в измерениях: это другое наблюдение, из
 * другого источника, с другими пределами. Смешивать её с видимостью нельзя
 * ни в базе, ни на экране — переходы систематически недосчитываются
 * (встроенные браузеры не передают источник), и как долю чего-либо их
 * читать нельзя.
 */
export const assistantTraffic = pgTable(
  "assistant_traffic",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** День в UTC: аналитика приходит днями, а не моментами. */
    day: date("day").notNull(),
    /** Идентификатор ассистента из каталога @repo/core. */
    assistant: text("assistant").notNull(),
    sessions: integer("sessions").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Повторный импорт того же дня перезаписывает, а не удваивает.
    uniqueIndex("assistant_traffic_unique_idx").on(table.clientId, table.day, table.assistant),
    index("assistant_traffic_client_idx").on(table.clientId),
  ],
);

export type AssistantTraffic = typeof assistantTraffic.$inferSelect;
export type NewAssistantTraffic = typeof assistantTraffic.$inferInsert;
