import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { planExperiment } from "@repo/core";
import type { SnapshotPoint } from "@repo/core";
import {
  addExperimentEvent,
  createExperiment,
  getActionById,
  getClientById,
  getExperimentByAction,
  getExperimentById,
  listAllSnapshots,
  listExperimentEvents,
  listExperiments,
  listPromptClusters,
  listPromptsByClient,
} from "@repo/db";
import { assertTenant, protectedProcedure, roleProcedure, router } from "../trpc";

export const experimentsRouter = router({
  list: protectedProcedure
    .input(z.object({ clientId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const client = await getClientById(ctx.db, input.clientId);
      assertTenant(client, ctx.user.agencyId);
      return listExperiments(ctx.db, input.clientId);
    }),

  get: protectedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const experiment = await getExperimentById(ctx.db, input.id);
    if (!experiment) {
      assertTenant(null, ctx.user.agencyId);
      throw new Error("unreachable");
    }
    const client = await getClientById(ctx.db, experiment.clientId);
    assertTenant(client, ctx.user.agencyId);

    return { experiment, events: await listExperimentEvents(ctx.db, experiment.id) };
  }),

  /**
   * Создаёт эксперимент из завершённого действия и сразу фиксирует baseline.
   * Baseline считается на момент создания намеренно: через несколько недель
   * период «до» уже не восстановить — данные смешаются.
   */
  createFromAction: roleProcedure("member")
    .input(z.object({ actionId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const action = await getActionById(ctx.db, input.actionId);
      if (!action) {
        assertTenant(null, ctx.user.agencyId);
        throw new Error("unreachable");
      }
      const client = await getClientById(ctx.db, action.clientId);
      assertTenant(client, ctx.user.agencyId);

      if (!action.completedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Complete the action first — the experiment needs a date to measure from.",
        });
      }

      const existing = await getExperimentByAction(ctx.db, action.id);
      if (existing) {
        return { experiment: existing, created: false, warnings: [] as string[] };
      }

      const [clusters, allPrompts, snapshotRows] = await Promise.all([
        listPromptClusters(ctx.db, action.clientId),
        listPromptsByClient(ctx.db, action.clientId),
        listAllSnapshots(ctx.db, action.clientId),
      ]);

      const snapshots: SnapshotPoint[] = snapshotRows.map((row) => ({
        clusterId: row.clusterId,
        periodStart: row.periodStart,
        clientVisibilityPct: Number(row.clientVisibilityPct),
        sampleCount: row.sampleCount,
      }));

      // Если действие не привязано к кластерам, лечим весь набор как treatment:
      // это слабее, но честнее, чем выбрать кластер за агентство.
      const treatmentClusterIds =
        action.affectedClusterIds.length > 0
          ? action.affectedClusterIds
          : clusters.map((cluster) => cluster.id);

      const plan = planExperiment(
        action.completedAt,
        clusters.map((cluster) => cluster.id),
        treatmentClusterIds,
        snapshots,
      );

      const experiment = await createExperiment(ctx.db, {
        clientId: action.clientId,
        actionId: action.id,
        actionDate: action.completedAt,
        baselineStart: plan.window.start,
        baselineEnd: plan.window.end,
        treatmentClusterIds: plan.treatmentClusterIds,
        controlClusterIds: plan.controlClusterIds,
        controlPromptIds: allPrompts.filter((p) => p.isControl).map((p) => p.id),
        status: "collecting",
      });

      await addExperimentEvent(ctx.db, {
        experimentId: experiment.id,
        type: "action_shipped",
        occurredAt: action.completedAt,
        note: action.title,
        payload: {
          baselineVisibilityPct: plan.treatment.visibilityPct,
          controlVisibilityPct: plan.control.visibilityPct,
          baselineSnapshots: plan.treatment.snapshots,
        },
      });

      // Предупреждения о слабых местах отдаются наружу, а не остаются в логах:
      // агентство должно знать, насколько шатка база сравнения.
      return { experiment, created: true, warnings: plan.warnings };
    }),

  addNote: roleProcedure("member")
    .input(z.object({ experimentId: z.uuid(), note: z.string().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const experiment = await getExperimentById(ctx.db, input.experimentId);
      if (!experiment) {
        assertTenant(null, ctx.user.agencyId);
        throw new Error("unreachable");
      }
      const client = await getClientById(ctx.db, experiment.clientId);
      assertTenant(client, ctx.user.agencyId);

      await addExperimentEvent(ctx.db, {
        experimentId: experiment.id,
        type: "note",
        occurredAt: new Date(),
        note: input.note,
      });

      return { ok: true };
    }),
});
