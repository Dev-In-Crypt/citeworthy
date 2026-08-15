import { z } from "zod";
import { buildRecommendations, diagnose } from "@repo/core";
import { getClientById, listCitationFacts } from "@repo/db";
import { assertTenant, protectedProcedure, router } from "../trpc";
import { clientSources, toCitationFacts } from "../../sources";

export const diagnosisRouter = router({
  /** Граф источников кластера: распределение типов, влиятельные площадки, вывод. */
  sourceGraph: protectedProcedure
    .input(
      z.object({
        clientId: z.uuid(),
        clusterId: z.uuid().nullable().default(null),
        limit: z.number().int().min(5).max(50).default(25),
      }),
    )
    .query(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      // Считает общая функция: тот же диагноз отдаёт публичный API.
      return clientSources(ctx.db, input.clientId, input.clusterId, input.limit);
    }),

  /** Кандидаты в действия. Каждая рекомендация несёт непустой reason (принцип 6). */
  recommendations: protectedProcedure
    .input(z.object({ clientId: z.uuid(), clusterId: z.uuid().nullable().default(null) }))
    .query(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      const facts = toCitationFacts(
        await listCitationFacts(ctx.db, input.clientId, input.clusterId),
      );

      return buildRecommendations(diagnose(facts), input.clusterId ?? undefined);
    }),
});
