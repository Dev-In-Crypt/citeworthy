import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { citations } from "./measurement";

export const sourceTypeEnum = pgEnum("source_type", [
  "owned",
  "editorial",
  "review",
  "directory",
  "ugc",
  "social",
  "product_feed",
  "documentation",
  "inaccessible",
  "other",
]);

/**
 * Источник = домен. Таблица глобальная, без agency_id: классификация домена
 * не зависит от агентства, и повторно платить модели за один и тот же домен
 * не нужно. Присутствие клиента
 * и конкурентов считается по фактам цитирования, а не хранится отдельно.
 *
 * Единственное исключение — тип owned: он зависит от клиента, поэтому
 * определяется на лету при диагностике, а не хранится здесь.
 */
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domain: text("domain").notNull(),
    sourceType: sourceTypeEnum("source_type"),
    /** Чем классифицирован: правилом или моделью — видно, чему доверять. */
    classifiedBy: text("classified_by"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("sources_domain_idx").on(table.domain)],
);

/** Связь цитаты с источником. */
export const citationSources = pgTable(
  "citation_sources",
  {
    citationId: uuid("citation_id")
      .notNull()
      .references(() => citations.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.citationId, table.sourceId] }),
    index("citation_sources_source_idx").on(table.sourceId),
  ],
);

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
