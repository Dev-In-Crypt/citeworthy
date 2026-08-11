import { z } from "zod";
import { buildRecommendations, diagnose } from "@repo/core";
import type { CitationFact, SourceType } from "@repo/core";
import { getClientById, listCitationFacts } from "@repo/db";
import { assertTenant, protectedProcedure, router } from "../trpc";

/** Схлопывает плоские строки join'а в один факт на пару (ответ, домен). */
function toFacts(
  rows: { responseId: string; domain: string; sourceType: string | null; entityName: string | null; isClient: boolean | null; isCompetitor: boolean | null }[],
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

      const facts = toFacts(await listCitationFacts(ctx.db, input.clientId, input.clusterId));
      const diagnosis = diagnose(facts, input.limit);

      return {
        ...diagnosis,
        totalCitations: facts.length,
        // Оговорка, которую нельзя терять: присутствие приближено упоминанием
        // в ответе, а не проверкой самой страницы источника.
        presenceCaveat:
          "Presence is inferred from answers where the source was cited, not from checking the page itself.",
      };
    }),

  /** Кандидаты в действия. Каждая рекомендация несёт непустой reason (принцип 6). */
  recommendations: protectedProcedure
    .input(z.object({ clientId: z.uuid(), clusterId: z.uuid().nullable().default(null) }))
    .query(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      const facts = toFacts(await listCitationFacts(ctx.db, input.clientId, input.clusterId));
      const diagnosis = diagnose(facts);

      return buildRecommendations(diagnosis, input.clusterId ?? undefined);
    }),
});
