import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { parseAdaptersMode } from "@repo/core";
import { aggregateClient, orchestrateRun, parseRun } from "@repo/pipeline";
import {
  createRun,
  getClientById,
  getRunById,
  getPromptById,
  getPromptClusterById,
  getScheduleForClient,
  listActivePromptsForClient,
  listResponsesForPrompt,
  listRecentRuns,
  upsertRunSchedule,
} from "@repo/db";
import { assertTenant, protectedProcedure, roleProcedure, router } from "../trpc";

// Литеральный кортеж, а не PLATFORMS: иначе zod выводит string[] и теряет union,
// который ждёт схема БД.
const platformEnum = z.enum(["chatgpt", "perplexity", "gemini"]);

export const runsRouter = router({
  schedule: protectedProcedure
    .input(z.object({ clientId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);
      return (await getScheduleForClient(ctx.db, input.clientId)) ?? null;
    }),

  saveSchedule: roleProcedure("member")
    .input(
      z.object({
        clientId: z.uuid(),
        cadence: z.enum(["daily", "weekly"]),
        platforms: z.array(platformEnum).min(1),
        samplesPerPrompt: z.number().int().min(1).max(10),
        active: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      const { clientId, ...values } = input;
      return upsertRunSchedule(ctx.db, clientId, values);
    }),

  list: protectedProcedure
    .input(z.object({ clientId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);
      return listRecentRuns(ctx.db, input.clientId, 10);
    }),

  get: protectedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const run = await getRunById(ctx.db, input.id);
    if (!run) {
      assertTenant(null, ctx.user.agencyId);
      throw new Error("unreachable");
    }
    const client = await getClientById(ctx.db, run.clientId);
    assertTenant(client, ctx.user.agencyId);
    return run;
  }),

  /** История ответов на промпт — то, из чего складывается цифра видимости. */
  responses: protectedProcedure
    .input(z.object({ promptId: z.uuid(), limit: z.number().int().min(1).max(100).default(30) }))
    .query(async ({ ctx, input }) => {
      const prompt = await getPromptById(ctx.db, input.promptId);
      if (!prompt) {
        assertTenant(null, ctx.user.agencyId);
        throw new Error("unreachable");
      }

      const cluster = await getPromptClusterById(ctx.db, prompt.clusterId);
      const client = cluster ? await getClientById(ctx.db, cluster.clientId) : undefined;
      assertTenant(client, ctx.user.agencyId);

      const rows = await listResponsesForPrompt(ctx.db, input.promptId, input.limit);

      return {
        prompt: { id: prompt.id, text: prompt.text, isControl: prompt.isControl },
        // Словарь отдаётся вместе с ответами: подсветка на клиенте должна
        // использовать те же имена, что и парсер.
        dictionary: {
          brandNames: client.brandNames.length > 0 ? client.brandNames : [],
          competitorNames: client.competitorNames,
        },
        responses: rows,
      };
    }),

  triggerManual: roleProcedure("member")
    .input(z.object({ clientId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);

      const prompts = await listActivePromptsForClient(ctx.db, input.clientId);
      if (prompts.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add at least one prompt before running a check.",
        });
      }

      const schedule = await getScheduleForClient(ctx.db, input.clientId);
      const run = await createRun(ctx.db, {
        clientId: input.clientId,
        scheduleId: schedule?.id ?? null,
        trigger: "manual",
      });

      const mode = parseAdaptersMode(process.env.ADAPTERS_MODE);

      if (mode === "mock") {
        // В mock-режиме прогон занимает миллисекунды, поэтому выполняется здесь же:
        // так ручной запуск работает без поднятого воркера.
        await orchestrateRun(ctx.db, run.id, mode);
        await parseRun(ctx.db, run.id);
        await aggregateClient(ctx.db, input.clientId);
      }
      // В live-режиме прогон уходит воркеру: сотни вызовов к платформам
      // не помещаются в один HTTP-запрос. Постановка в очередь — T22 follow-up,
      // пока живые адаптеры не подключены (T13–T15).

      return { runId: run.id, executedInline: mode === "mock" };
    }),
});
