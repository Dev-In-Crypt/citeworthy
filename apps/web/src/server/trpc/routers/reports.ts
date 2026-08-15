import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  buildOpportunity,
  buildRecommendations,
  buildReportPayload,
  collapsePromptFacts,
  computeMovement,
  computePromptMatrix,
  diagnose,
  OPPORTUNITY_CAVEATS,
  OPPORTUNITY_DEFAULTS,
  REPORT_COPY,
  reportReadyEmail,
  summariseTraffic,
} from "@repo/core";
import type { CitationFact, SourceType, VisibilitySnapshot } from "@repo/core";
import {
  listCitationFacts,
  countClientMentionsBetween,
  countNewCitedDomains,
  createReport,
  createReportShare,
  getAgencyById,
  getClientById,
  getReportById,
  getShareForReport,
  listActions,
  listActionsCompletedBetween,
  listActivePromptsForClient,
  listAllSnapshots,
  listAssistantTraffic,
  listPromptPlatformFacts,
  listReports,
  listExperiments,
  logActivity,
  setReportStatus,
} from "@repo/db";
import { assertTenant, protectedProcedure, roleProcedure, router } from "../trpc";
import { appUrl, getEmailSender } from "../../email";

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

      // Платформы берутся из срезов по платформам, а не из расписания:
      // важно, что реально измерено, а не что было настроено.
      const measuredPlatforms = [
        ...new Set(
          snapshotRows
            .filter((row) => row.platform !== null && row.periodStart >= periodStart)
            .map((row) => row.platform as string),
        ),
      ];

      /**
       * Движение по отдельным вопросам за период против такого же окна перед
       * ним. Считается по тем же ответам, что и экран клиента, и попадает
       * в отчёт только там, где обе выборки набрали порог: вопрос, который
       * нечем сравнить, не должен выглядеть как «не изменился».
       */
      const periodMs = periodEnd.getTime() - periodStart.getTime();
      const previousStart = new Date(periodStart.getTime() - periodMs);

      const [currentFacts, previousFacts, activePrompts] = await Promise.all([
        listPromptPlatformFacts(ctx.db, input.clientId, periodStart, periodEnd),
        listPromptPlatformFacts(ctx.db, input.clientId, previousStart, periodStart),
        listActivePromptsForClient(ctx.db, input.clientId),
      ]);

      const promptRows = activePrompts.map((prompt) => ({
        id: prompt.id,
        text: prompt.text,
        clusterId: prompt.clusterId,
      }));

      const currentMatrix = computePromptMatrix({
        records: collapsePromptFacts(currentFacts),
        prompts: promptRows,
        from: periodStart,
        to: periodEnd,
      });
      const previousMatrix = computePromptMatrix({
        records: collapsePromptFacts(previousFacts),
        prompts: promptRows,
        from: previousStart,
        to: periodStart,
      });

      const deltas = new Map(
        computeMovement(currentMatrix, previousMatrix).map((entry) => [
          entry.promptId,
          entry.deltaPp,
        ]),
      );

      const distinguishable = new Set(
        computeMovement(currentMatrix, previousMatrix)
          .filter((entry) => entry.distinguishable)
          .map((entry) => entry.promptId),
      );

      const movement = currentMatrix.rows
        // В отчёт клиенту идёт только то, что выборка действительно различает:
        // «+3 pp», неотличимые от шума, читаются как результат работы.
        .filter(
          (row) =>
            deltas.get(row.promptId) != null &&
            row.ratePct !== null &&
            distinguishable.has(row.promptId),
        )
        .map((row) => ({
          prompt: row.promptText,
          deltaPp: deltas.get(row.promptId)!,
          sharePct: row.ratePct!,
        }))
        // Сначала то, что сдвинулось сильнее — об этом и спросят.
        .sort((a, b) => Math.abs(b.deltaPp) - Math.abs(a.deltaPp))
        .slice(0, 20);

      /**
       * Переходы от ассистентов за тот же период. В отчёт попадают только
       * если аналитику импортировали: пустая таблица читалась бы клиентом
       * как «переходов не было», а верное утверждение — «мы их не считали».
       */
      const trafficRows = await listAssistantTraffic(ctx.db, input.clientId);
      const traffic = summariseTraffic(
        trafficRows.map((row) => ({
          day: new Date(`${row.day}T00:00:00.000Z`),
          assistant: row.assistant,
          sessions: row.sessions,
        })),
        periodStart,
        periodEnd,
      );

      const payload = buildReportPayload({
        movement,
        ...(traffic.totalSessions > 0
          ? {
              assistantTraffic: {
                totalSessions: traffic.totalSessions,
                byAssistant: traffic.byAssistant
                  .slice(0, 10)
                  .map(({ assistant, sessions }) => ({ assistant, sessions })),
              },
            }
          : {}),
        clientName: client.name,
        periodStart,
        periodEnd,
        snapshots,
        measuredPlatforms,
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
        measuredPlatforms: [
          ...new Set(
            snapshotRows
              .filter((row) => row.platform !== null)
              .map((row) => row.platform as string),
          ),
        ],
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

  /**
   * Отправляет клиенту ссылку на отчёт.
   *
   * Явное действие человека, а не рассылка: продукт ничего не отправляет сам
   * (инвариант 4). Письмо несёт ссылку, а не сам отчёт — документ живёт на
   * своей странице, где его можно согласовать, и не расходится копиями по
   * почтовым ящикам.
   */
  send: roleProcedure("member")
    .input(z.object({ reportId: z.uuid(), to: z.email(), note: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const report = await getReportById(ctx.db, input.reportId);
      if (!report) {
        assertTenant(null, ctx.user.agencyId);
        throw new Error("unreachable");
      }
      const client = await getClientById(ctx.db, report.clientId);
      assertTenant(client, ctx.user.agencyId);

      const agency = await getAgencyById(ctx.db, ctx.user.agencyId);

      // Ссылка выдаётся здесь же, если её ещё не было: отправлять отчёт,
      // который некуда открыть, бессмысленно.
      let share = await getShareForReport(ctx.db, report.id);
      if (!share) {
        const token = randomBytes(32).toString("base64url");
        share = await createReportShare(ctx.db, { reportId: report.id, token });
        await setReportStatus(ctx.db, report.id, "shared");
      }

      const message = reportReadyEmail({
        to: input.to,
        // Письмо клиенту агентства несёт бренд агентства, а не продукта
        // (инвариант 3): подписывается оно именем агентства.
        agencyName: agency?.name ?? "Your agency",
        clientName: client.name,
        periodStart: report.periodStart.toISOString().slice(0, 10),
        periodEnd: report.periodEnd.toISOString().slice(0, 10),
        reportUrl: `${appUrl()}/r/${share.token}`,
        ...(input.note ? { note: input.note } : {}),
      });

      await getEmailSender().send(message);

      await logActivity(ctx.db, {
        agencyId: ctx.user.agencyId,
        clientId: client.id,
        // Как и остальные события журнала — без ссылки на пользователя:
        // строка живёт дольше учётной записи, которая её создала.
        actorUserId: null,
        eventType: "report_shared",
        payload: { reportId: report.id, to: input.to },
      });

      return { sent: true, token: share.token };
    }),
});
