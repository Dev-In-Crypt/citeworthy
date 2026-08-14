import { z } from "zod";
import {
  collapsePromptFacts,
  competitorGapPp,
  computeMovement,
  computeProminence,
  computePromptMatrix,
  isDistinguishable,
  MIN_SAMPLES_PER_CELL,
} from "@repo/core";
import {
  getClientById,
  listActivePromptsForClient,
  listPromptPlatformFacts,
  listVisibilitySeries,
} from "@repo/db";
import { assertTenant, protectedProcedure, router } from "../trpc";

const platformEnum = z.enum(["chatgpt", "perplexity", "gemini"]);

export const measurementRouter = router({
  /** Ряд видимости для графика плюс сводка последнего периода. */
  visibility: protectedProcedure
    .input(
      z.object({
        clientId: z.uuid(),
        clusterId: z.uuid().nullable().default(null),
        platform: platformEnum.nullable().default(null),
      }),
    )
    .query(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      const rows = await listVisibilitySeries(ctx.db, input.clientId, {
        clusterId: input.clusterId,
        platform: input.platform,
      });

      const series = rows.map((row) => ({
        periodStart: row.periodStart,
        clientVisibilityPct: Number(row.clientVisibilityPct),
        competitorVisibility: row.competitorVisibility,
        sampleCount: row.sampleCount,
        sufficient: row.sufficient,
      }));

      const latest = series.at(-1) ?? null;
      const previous = series.length > 1 ? series[series.length - 2]! : null;

      return {
        series,
        // Названия конкурентов берём из настроек клиента, а не из данных:
        // конкурент, ни разу не упомянутый, тоже должен быть виден на графике как 0.
        competitorNames: client.competitorNames,
        latest: latest
          ? {
              visibilityPct: latest.clientVisibilityPct,
              competitorGapPp: competitorGapPp({
                clusterId: input.clusterId,
                platform: input.platform,
                periodStart: latest.periodStart,
                periodEnd: latest.periodStart,
                clientVisibilityPct: latest.clientVisibilityPct,
                competitorVisibility: latest.competitorVisibility,
                sampleCount: latest.sampleCount,
                sufficient: latest.sufficient,
              }),
              sampleCount: latest.sampleCount,
              // Ниже порога цифру нельзя подавать как измерение (инвариант 6).
              sufficient: latest.sufficient,
              minSamples: MIN_SAMPLES_PER_CELL,
              deltaPp:
                previous === null
                  ? null
                  : Math.round((latest.clientVisibilityPct - previous.clientVisibilityPct) * 10) /
                    10,
            }
          : null,
      };
    }),

  /**
   * Матрица «промпт × ассистент» за окно.
   *
   * Окно по умолчанию — 28 дней, а не неделя: при нынешнем расписании
   * недельная ячейка почти всегда не набирает порог сэмплов, и экран
   * состоял бы из прочерков. Ширина окна показана в интерфейсе рядом
   * с числами — иначе они читались бы как «за неделю».
   */
  matrix: protectedProcedure
    .input(
      z.object({
        clientId: z.uuid(),
        windowDays: z.number().int().min(7).max(90).default(28),
      }),
    )
    .query(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      const to = new Date();
      const windowMs = input.windowDays * 86_400_000;
      const from = new Date(to.getTime() - windowMs);
      // Предыдущее окно той же длины — только для ответа «что изменилось».
      const previousFrom = new Date(from.getTime() - windowMs);

      const [prompts, facts, previousFacts] = await Promise.all([
        listActivePromptsForClient(ctx.db, input.clientId),
        listPromptPlatformFacts(ctx.db, input.clientId, from, to),
        listPromptPlatformFacts(ctx.db, input.clientId, previousFrom, from),
      ]);

      // Порядок строк фиксируем здесь: запрос его не гарантирует, а матрица,
      // переставляющая вопросы между заходами, нечитаема.
      const ordered = [...prompts].sort((a, b) => {
        const byTime = a.createdAt.getTime() - b.createdAt.getTime();
        return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
      });

      const records = collapsePromptFacts(facts);
      const promptRows = ordered.map((prompt) => ({
        id: prompt.id,
        text: prompt.text,
        clusterId: prompt.clusterId,
      }));

      const matrix = computePromptMatrix({ records, prompts: promptRows, from, to });

      const previous = computePromptMatrix({
        records: collapsePromptFacts(previousFacts),
        prompts: promptRows,
        from: previousFrom,
        to: from,
      });

      /**
       * Заметность считается по тем же ответам, что и матрица: «назван» и
       * «назван первым» — разные вещи, а мерить их по разным выборкам
       * значит получить два числа, которые нельзя сопоставить.
       */
      const prominence = computeProminence(
        records.map((record) => ({
          responseId: record.responseId,
          clientRank: record.clientRank ?? null,
          competitorRanks: record.competitorRanks ?? [],
        })),
      );

      return {
        ...matrix,
        prominence,
        movement: computeMovement(matrix, previous),
        // Общее движение — та же логика: сравнивать можно только два окна,
        // каждое из которых само по себе набрало порог.
        totalsDeltaPp:
          matrix.totals.ratePct !== null && previous.totals.ratePct !== null
            ? Math.round((matrix.totals.ratePct - previous.totals.ratePct) * 10) / 10
            : null,
        /** Различает ли выборка это изменение вообще. */
        totalsDistinguishable: isDistinguishable(matrix.totals.interval, previous.totals.interval),
        client: { name: client.name, domain: client.domain },
        competitorNames: client.competitorNames,
        minSamples: MIN_SAMPLES_PER_CELL,
      };
    }),
});
