import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agencies } from "./tenancy";

/**
 * Расход по агентству за биллинговый период.
 *
 * Единица тарификации продукта — активный клиентский аккаунт, но переменная
 * стоимость создаётся вызовами к платформам, поэтому их считаем отдельно:
 * без этого счётчика нельзя ни выставить overage, ни заметить, что клиент
 * с сотней промптов съедает маржу.
 */
export const usageCounters = pgTable(
  "usage_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    /** Биллинговый период в формате YYYY-MM (UTC). */
    period: text("period").notNull(),
    /** Один ответ платформы = один AI check. */
    aiChecksUsed: integer("ai_checks_used").notNull().default(0),
    clientsActive: integer("clients_active").notNull().default(0),
    promptsActive: integer("prompts_active").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("usage_counters_agency_period_idx").on(table.agencyId, table.period)],
);

export type UsageCounter = typeof usageCounters.$inferSelect;
export type NewUsageCounter = typeof usageCounters.$inferInsert;
