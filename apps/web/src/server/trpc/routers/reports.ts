import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  buildOpportunity,
  buildRecommendations,
  buildReportPayload,
  diagnose,
  OPPORTUNITY_CAVEATS,
  OPPORTUNITY_DEFAULTS,
  REPORT_COPY,
} from "@repo/core";
import type { CitationFact, SourceType, VisibilitySnapshot } from "@repo/core";
import {
  listCitationFacts,
  countClientMentionsBetween,
  countNewCitedDomains,
  createReport,
  createReportShare,
  getClientById,
  getReportById,
  getShareForReport,
  listActions,
  listActionsCompletedBetween,
  listAllSnapshots,
  listReports,
  listExperiments,
  logActivity,
  setReportStatus,
} from "@repo/db";
import { assertTenant, protectedProcedure, roleProcedure, router } from "../trpc";

/** Та же схлопка, что в роутере диагностики: один факт на пару (ответ, домен). */
function toFacts(
  rows: {
    responseId: string;
    domain: string;
    sourceType: string | null;
    entityName: string | null;
    isClient: boolean | null;
    isCompetitor: boolean | null;
  }[],
): CitationFact[] {
  const byKey = new Map<string, CitationFact>();

  for (const row of rows) {
    const key = `${row.responseId}|${row.domain}`;
    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        domain: row.domain,
        sourceType: (row.sourceType as SourceType | null) ?? null,
        clientMentioned: false,
        competitorsMentioned: [],
      };
      byKey.set(key, entry);
    }
    if (row.isClient) entry.clientMentioned = true;
    if (row.isCompetitor && row.entityName) entry.competitorsMentioned.push(row.entityName);
  }

  return [...byKey.values()];
}

/** Период по умолчанию — календарный месяц назад от конца. */
function defaultPeriod(): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start, end };
}

export const reportsRouter = router({
  list: protectedProcedure
    .input(z.object({ clientId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      return listReports(ctx.db, input.clientId);
    }),

  get: protectedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const report = await getReportById(ctx.db, input.id);
    if (!report) {
      assertTenant(null, ctx.user.agencyId);
      throw new Error("unreachable");
    }
    const client = await getClientById(ctx.db, report.clientId);
    assertTenant(client, ctx.user.agencyId);

    return { report, share: await getShareForReport(ctx.db, report.id) };
  }),

  /**
   * Собирает отчёт за период и сохраняет payload целиком.
   * Payload не пересчитывается при просмотре: клиент видел конкретные цифры
   * на конкретную дату, и менять их задним числом нельзя.
   */
  generate: roleProcedure("member")
    .input(
      z.object({
        clientId: z.uuid(),
        periodStart: z.iso.datetime().optional(),
        periodEnd: z.iso.datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      const fallback = defaultPeriod();
      const periodStart = input.periodStart ? new Date(input.periodStart) : fallback.start;
      const periodEnd = input.periodEnd ? new Date(input.periodEnd) : fallback.end;

      const [snapshotRows, completedActions, newCitedUrls, newBrandMentions, experiments, allActions] =
        await Promise.all([
          listAllSnapshots(ctx.db, input.clientId),
          listActionsCompletedBetween(ctx.db, input.clientId, periodStart, periodEnd),
          countNewCitedDomains(ctx.db, input.clientId, periodStart, periodEnd),
          countClientMentionsBetween(ctx.db, input.clientId, periodStart, periodEnd),
          listExperiments(ctx.db, input.clientId),
          listActions(ctx.db, input.clientId),
        ]);

      // Только свёртки (все кластеры, все платформы) и только внутри периода:
      // клиенту показывается общая видимость, а не срез по одной платформе.
      const snapshots: VisibilitySnapshot[] = snapshotRows
        .filter(
          (row) =>
            row.clusterId === null &&
            row.platform === null &&
            row.periodStart >= periodStart &&
            row.periodStart <= periodEnd,
        )
        .map((row) => ({
          clusterId: null,
          platform: null,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          clientVisibilityPct: Number(row.clientVisibilityPct),
          competitorVisibility: row.competitorVisibility,
          sampleCount: row.sampleCount,
          sufficient: row.sufficient,
        }));

      const caveats: string[] = [];
      if (experiments.some((experiment) => experiment.controlClusterIds.length === 0)) {
        caveats.push(REPORT_COPY.noComparisonGroup);
      }
      const periodDays = (periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000);
      if (periodDays < 60) {
        // Спек: моделям нужно 60–90 дней, чтобы переобойти и сдвинуть цитаты.
        caveats.push(REPORT_COPY.shortPeriod);
      }

      const payload = buildReportPayload({
        clientName: client.name,
        periodStart,
        periodEnd,
        snapshots,
        completedActions: completedActions.map((action) => ({
          title: action.title,
          actionType: action.actionType,
        })),
        newCitedUrls,
        newBrandMentions,
        // Самое влиятельное действие определяется позже, когда у экспериментов
        // появятся результаты; пока раздел честно пуст.
        highestImpact: null,
        nextSprint: allActions
          .filter((action) => action.status === "backlog" || action.status === "in_progress")
          .slice(0, 3)
          .map((action) => action.title),
        caveats,
      });

      const report = await createReport(ctx.db, {
        clientId: input.clientId,
        periodStart,
        periodEnd,
        status: "draft",
        payload,
      });

      await logActivity(ctx.db, {
        agencyId: ctx.user.agencyId,
        clientId: input.clientId,
        actorUserId: null,
        eventType: "report_generated",
        payload: { reportId: report.id, period: payload.period },
      });

      return report;
    }),

  /**
   * Отчёт по бесплатному аудиту: что показали измерения, что предлагается
   * сделать и во что это обойдётся.
   *
   * Ретейнер и часы приходят из формы, а не считаются: их знает только
   * агентство. Дефолты из спека подставляются, если поле не заполнено.
   */
  generateOpportunity: roleProcedure("member")
    .input(
      z.object({
        clientId: z.uuid(),
        retainerUsd: z.number().int().positive().max(1_000_000).optional(),
        effortHoursMin: z.number().positive().max(1000).optional(),
        effortHoursMax: z.number().positive().max(1000).optional(),
        hourlyCostUsd: z.number().positive().max(10_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      const [snapshotRows, citationRows] = await Promise.all([
        listAllSnapshots(ctx.db, input.clientId),
        listCitationFacts(ctx.db, input.clientId, null),
      ]);

      // Аудит — снимок «как сейчас», поэтому берётся последняя свёртка,
      // а не движение за период: движения ещё не было.
      const rollups = snapshotRows.filter(
        (row) => row.clusterId === null && row.platform === null,
      );
      const latest = rollups.at(-1);

      const snapshots: VisibilitySnapshot[] = latest
        ? [
            {
              clusterId: null,
              platform: null,
              periodStart: latest.periodStart,
              periodEnd: latest.periodEnd,
              clientVisibilityPct: Number(latest.clientVisibilityPct),
              competitorVisibility: latest.competitorVisibility,
              sampleCount: latest.sampleCount,
              sufficient: latest.sufficient,
            },
          ]
        : [];

      const recommendations = buildRecommendations(diagnose(toFacts(citationRows)));

      const effortHours = {
        min: input.effortHoursMin ?? OPPORTUNITY_DEFAULTS.effortHours.min,
        max: input.effortHoursMax ?? OPPORTUNITY_DEFAULTS.effortHours.max,
      };

      const opportunity = buildOpportunity({
        currentVisibilityPct: latest ? Number(latest.clientVisibilityPct) : 0,
        competitorVisibility: latest?.competitorVisibility ?? {},
        rankedActions: recommendations.map((recommendation) => ({
          title: recommendation.title,
          reason: recommendation.reason,
          estimatedImpact: recommendation.estimatedImpact,
          effort: recommendation.effort,
        })),
        ...(input.retainerUsd !== undefined ? { retainerUsd: input.retainerUsd } : {}),
        effortHours,
        ...(input.hourlyCostUsd !== undefined ? { hourlyCostUsd: input.hourlyCostUsd } : {}),
      });

      const caveats: string[] = [...OPPORTUNITY_CAVEATS];
      // Недобор сэмплов в аудите — обычное дело: прогон один.
      if (latest && !latest.sufficient) {
        caveats.push(REPORT_COPY.shortPeriod);
      }

      const periodEnd = latest?.periodEnd ?? new Date();
      const periodStart = latest?.periodStart ?? periodEnd;

      const payload = buildReportPayload({
        clientName: client.name,
        periodStart,
        periodEnd,
        snapshots,
        completedActions: [],
        newCitedUrls: 0,
        newBrandMentions: 0,
        highestImpact: null,
        // Ближайшие шаги — верх того же ранжированного списка, без выдумок.
        nextSprint: opportunity.rankedActions.slice(0, 3).map((action) => action.title),
        caveats,
        opportunity,
      });

      const report = await createReport(ctx.db, {
        clientId: input.clientId,
        periodStart,
        periodEnd,
        status: "draft",
        payload,
      });

      await logActivity(ctx.db, {
        agencyId: ctx.user.agencyId,
        clientId: input.clientId,
        actorUserId: null,
        eventType: "report_generated",
        payload: { reportId: report.id, audit: true },
      });

      return report;
    }),

  /** Выдаёт ссылку для клиента агентства. Повторный вызов её не меняет. */
  share: roleProcedure("member")
    .input(z.object({ reportId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const report = await getReportById(ctx.db, input.reportId);
      if (!report) {
        assertTenant(null, ctx.user.agencyId);
        throw new Error("unreachable");
      }
      const client = await getClientById(ctx.db, report.clientId);
      assertTenant(client, ctx.user.agencyId);

      const existing = await getShareForReport(ctx.db, report.id);
      if (existing) {
        return { token: existing.token, created: false };
      }

      // 32 байта: ссылка — единственный способ доступа, и перебор должен быть
      // бессмысленным.
      const token = randomBytes(32).toString("base64url");
      await createReportShare(ctx.db, { reportId: report.id, token });
      await setReportStatus(ctx.db, report.id, "shared");

      return { token, created: true };
    }),
});
