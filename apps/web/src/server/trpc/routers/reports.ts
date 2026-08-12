import { randomBytes } from "node:crypto";
import { z } from "zod";
import { buildReportPayload, REPORT_COPY } from "@repo/core";
import type { VisibilitySnapshot } from "@repo/core";
import {
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
