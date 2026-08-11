import { z } from "zod";
import { competitorGapPp, MIN_SAMPLES_PER_CELL } from "@repo/core";
import { getClientById, listVisibilitySeries } from "@repo/db";
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
});
