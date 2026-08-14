import { z } from "zod";
import {
  collapsePromptFacts,
  competitorGapPp,
  computePromptMatrix,
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
      const from = new Date(to.getTime() - input.windowDays * 86_400_000);

      const [prompts, facts] = await Promise.all([
        listActivePromptsForClient(ctx.db, input.clientId),
        listPromptPlatformFacts(ctx.db, input.clientId, from, to),
      ]);

      // Порядок строк фиксируем здесь: запрос его не гарантирует, а матрица,
      // переставляющая вопросы между заходами, нечитаема.
      const ordered = [...prompts].sort((a, b) => {
        const byTime = a.createdAt.getTime() - b.createdAt.getTime();
        return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
      });

      const matrix = computePromptMatrix({
        records: collapsePromptFacts(facts),
        prompts: ordered.map((prompt) => ({
          id: prompt.id,
          text: prompt.text,
          clusterId: prompt.clusterId,
        })),
        from,
        to,
      });

      return {
        ...matrix,
        client: { name: client.name, domain: client.domain },
        competitorNames: client.competitorNames,
        minSamples: MIN_SAMPLES_PER_CELL,
      };
    }),
});
