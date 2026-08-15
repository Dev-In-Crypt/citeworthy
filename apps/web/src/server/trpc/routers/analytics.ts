import { z } from "zod";
import { parseTrafficCsv, summariseTraffic } from "@repo/core";
import {
  getClientById,
  listAssistantTraffic,
  upsertAssistantTraffic,
} from "@repo/db";
import { assertTenant, protectedProcedure, roleProcedure, router } from "../trpc";
import { getAnalyticsProvider } from "../../analytics";

/**
 * Переходы от ассистентов.
 *
 * Второе наблюдение рядом с видимостью, а не её следствие: переходы
 * систематически недосчитываются, и связывать одно с другим как причину
 * и результат продукт не вправе (инвариант 2).
 */
export const analyticsRouter = router({
  importTraffic: roleProcedure("member")
    .input(z.object({ clientId: z.uuid(), csv: z.string().min(1).max(2_000_000) }))
    .mutation(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      const parsed = parseTrafficCsv(input.csv);

      const written = await upsertAssistantTraffic(
        ctx.db,
        parsed.rows.map((row) => ({
          clientId: input.clientId,
          // date-колонка принимает YYYY-MM-DD; день хранится в UTC.
          day: row.day.toISOString().slice(0, 10),
          assistant: row.assistant,
          sessions: row.sessions,
        })),
      );

      return {
        imported: written,
        errors: parsed.errors,
        // Источники, которые не относятся ни к одному ассистенту, названы
        // поимённо: иначе цифра расходится с аналитикой клиента без объяснения.
        skippedReferrers: parsed.skippedReferrers,
      };
    }),

  summary: protectedProcedure
    .input(
      z.object({
        clientId: z.uuid(),
        windowDays: z.number().int().min(7).max(365).default(28),
      }),
    )
    .query(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      const rows = await listAssistantTraffic(ctx.db, input.clientId);
      const to = new Date();
      const from = new Date(to.getTime() - input.windowDays * 86_400_000);

      const summary = summariseTraffic(
        rows.map((row) => ({
          day: new Date(`${row.day}T00:00:00.000Z`),
          assistant: row.assistant,
          sessions: row.sessions,
        })),
        from,
        to,
      );

      return {
        ...summary,
        windowDays: input.windowDays,
        /** Подключено ли живое чтение аналитики. Пока — нет, и это сказано прямо. */
        liveConnection: getAnalyticsProvider().configured,
      };
    }),
});
