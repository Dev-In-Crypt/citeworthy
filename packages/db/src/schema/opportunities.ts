import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { clients, users } from "./tenancy";
import { sources } from "./sources";

/**
 * Модуль сознательно зависит только от tenancy и sources.
 *
 * Ссылка идёт в обратную сторону — из actions на возможность-источник, —
 * и импорт отсюда в actions или experiments замкнул бы граф модулей в цикл:
 * experiments уже ссылается на actions. Поэтому уровень доказательности
 * хранится текстом со своим типом, а не общим enum'ом confidence_level, а
 * приоритет не хранится вовсе: он однозначно выводится из оценки
 * (`priorityFor` в @repo/core), и вторая его копия рано или поздно разошлась
 * бы с первой.
 */

export const opportunityKindEnum = pgEnum("opportunity_kind", [
  "competitor_gap",
  "source_gap",
  "content_gap",
  "cluster_gap",
]);

export const opportunityStatusEnum = pgEnum("opportunity_status", [
  "open",
  "snoozed",
  "dismissed",
  "converted",
]);

/**
 * Возможность — где клиент проигрывает, почему и что с этим делать.
 *
 * До неё диагноз считался заново на каждый заход экрана и никуда не
 * сохранялся: приоритизировать между клиентами было нечего, переносить в
 * работу вместе с доказательством — нечего, показать клиенту как причину
 * ретейнера — тоже нечего.
 *
 * Строки пересчитываются после каждого прогона. Поэтому колонки поделены на
 * две группы, и деление это несущее:
 *
 *   • машинные — их переписывает генератор (оценка, разбор, доказательство,
 *     причина, ходы, окно, last_detected_at, generation_id);
 *   • человеческие — их не трогает никто, кроме человека: status,
 *     dismissed_reason, snoozed_until, decision_score, decided_by_user_id,
 *     decided_at, first_detected_at.
 *
 * Если пересчёт затрёт вторую группу, агентство отклонит десяток пунктов, а
 * ночной прогон вернёт их все — и функция станет хуже, чем её отсутствие.
 */
export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Tenancy: клиент несёт agency_id, отдельная копия здесь была бы лишней. */
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /**
     * Ключ, по которому возможность узнаётся между пересчётами. В него не
     * входят ни оценка, ни дата, ни счётчики: всё, что законно меняется от
     * прогона к прогону, превратило бы ту же возможность в новую строку.
     */
    dedupeKey: text("dedupe_key").notNull(),
    kind: opportunityKindEnum("kind").notNull(),
    title: text("title").notNull(),
    /** Инвариант 7: возможность без объяснения бесполезна агентству. */
    reason: text("reason").notNull(),

    score: integer("score").notNull(),
    /**
     * Версия формулы. Веса будут пересматриваться, и без версии такой
     * пересмотр молча переписал бы всю историю: на вопрос «почему в марте
     * здесь стояло 91» ответить было бы нечем.
     */
    scoreVersion: smallint("score_version").notNull().default(1),
    scoreBreakdown: jsonb("score_breakdown").$type<Record<string, unknown>>().notNull(),
    evidenceLevel: text("evidence_level").$type<"low" | "medium" | "high">().notNull(),
    /** Числа, на которых стоит оценка, замороженные в момент расчёта. */
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    /** Кандидаты в работу. Строками в actions они станут только при переносе. */
    recommendedActions: jsonb("recommended_actions")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),

    affectedPromptIds: uuid("affected_prompt_ids").array().notNull().default([]),
    affectedClusterIds: uuid("affected_cluster_ids").array().notNull().default([]),
    competitorNames: text("competitor_names").array().notNull().default([]),
    sourceDomain: text("source_domain"),
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),

    /**
     * Окно, за которое посчитана возможность. Без него карточка и её
     * доказательство разошлись бы: окно скользящее, и «почему здесь 91»
     * получило бы ответ из других данных, чем те, что дали 91.
     */
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    sampleCount: integer("sample_count").notNull().default(0),

    status: opportunityStatusEnum("status").notNull().default("open"),
    dismissedReason: text("dismissed_reason"),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    /**
     * Оценка на момент решения человека. Отклонение — суждение о фактах тогда,
     * а не приговор навсегда: если разрыв заметно вырос, его стоит показать
     * снова, и сравнивать есть с чем.
     */
    decisionScore: integer("decision_score"),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),

    /** Никогда не обновляется: «этот разрыв открыт с марта» — фраза для клиента. */
    firstDetectedAt: timestamp("first_detected_at", { withTimezone: true }).notNull().defaultNow(),
    lastDetectedAt: timestamp("last_detected_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Партия пересчёта. Закрытие делается одним предикатом
     * `generation_id <> текущий` — это корректно и тогда, когда детектор упал
     * на середине: строки просто останутся с прошлой партией.
     */
    generationId: uuid("generation_id").notNull(),
    /**
     * Возможность перестала обнаруживаться. Строки не удаляются никогда:
     * закрытая возможность рядом с выполненным действием — это запись о том,
     * что изменилось, и она нужна отчёту.
     */
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("opportunities_dedupe_idx").on(table.clientId, table.dedupeKey),
    index("opportunities_list_idx").on(table.clientId, table.status, table.score),
    index("opportunities_generation_idx").on(table.clientId, table.generationId),
  ],
);

export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;
