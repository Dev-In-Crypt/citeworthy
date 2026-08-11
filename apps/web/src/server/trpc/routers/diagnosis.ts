import { z } from "zod";
import { diagnose } from "@repo/core";
import type { CitationFact, SourceType } from "@repo/core";
import { getClientById, listCitationFacts } from "@repo/db";
import { assertTenant, protectedProcedure, router } from "../trpc";

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

      const rows = await listCitationFacts(ctx.db, input.clientId, input.clusterId);

      /**
       * Плоские строки join'а схлопываются в один факт на пару
       * (ответ, домен): у ответа несколько упоминаний и несколько ссылок,
       * и без группировки один источник считался бы многократно.
       */
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
        if (row.isCompetitor && row.entityName) {
          entry.competitorsMentioned.push(row.entityName);
        }
      }

      const diagnosis = diagnose([...byKey.values()], input.limit);

      return {
        ...diagnosis,
        totalCitations: byKey.size,
        // Оговорка, которую нельзя терять: присутствие приближено упоминанием
        // в ответе, а не проверкой самой страницы источника.
        presenceCaveat:
          "Presence is inferred from answers where the source was cited, not from checking the page itself.",
      };
    }),
});
