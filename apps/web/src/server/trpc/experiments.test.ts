import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { EXPERIMENT_WARNINGS } from "@repo/core";
import {
  createAgency,
  createClient,
  createDb,
  createPromptCluster,
  deleteAgency,
  listExperimentEvents,
  setActionCompletedAt,
  upsertVisibilitySnapshot,
} from "@repo/db";
import { appRouter } from "./root";
import type { SessionUser, TrpcContext } from "./context";

/** Verify T43: baseline совпадает с ручным расчётом по срезам. */

const { db, close } = createDb();

afterAll(async () => {
  await close();
});

function caller(agencyId: string) {
  const user: SessionUser = {
    id: crypto.randomUUID(),
    email: "owner@test.local",
    name: "Owner",
    agencyId,
    role: "owner",
  };
  return appRouter.createCaller({ db, user } as TrpcContext);
}

const ACTION_DATE = new Date("2026-08-31T00:00:00Z");

describe("experiments.createFromAction", () => {
  let agencyId = "";
  let clientId = "";
  let treatmentClusterId = "";
  let controlClusterId = "";

  beforeEach(async () => {
    const agency = await createAgency(db, { name: "Exp Agency", clientLimit: 10 });
    agencyId = agency.id;
    const client = await createClient(db, { agencyId, name: "AcmeCRM", domain: "acmecrm.test" });
    clientId = client.id;

    treatmentClusterId = (
      await createPromptCluster(db, { clientId, name: "Comparison", intent: "comparison" })
    ).id;
    controlClusterId = (
      await createPromptCluster(db, { clientId, name: "Basics", intent: "learning" })
    ).id;

    // Два недельных среза до действия. Взвешенное среднее считается вручную:
    // treatment (18×20 + 22×30) / 50 = 20.4; control (21×20 + 21×30) / 50 = 21.
    const points: [string, string, number, number][] = [
      [treatmentClusterId, "2026-08-10T00:00:00Z", 18, 20],
      [treatmentClusterId, "2026-08-17T00:00:00Z", 22, 30],
      [controlClusterId, "2026-08-10T00:00:00Z", 21, 20],
      [controlClusterId, "2026-08-17T00:00:00Z", 21, 30],
      // Срез сильно раньше окна — в baseline попасть не должен.
      [treatmentClusterId, "2026-06-01T00:00:00Z", 90, 100],
    ];

    for (const [clusterId, week, pct, samples] of points) {
      await upsertVisibilitySnapshot(db, {
        clientId,
        clusterId,
        platform: null,
        periodStart: new Date(week),
        periodEnd: new Date(new Date(week).getTime() + 7 * 24 * 60 * 60 * 1000),
        clientVisibilityPct: pct.toFixed(1),
        competitorVisibility: {},
        sampleCount: samples,
        sufficient: true,
      });
    }
  });

  afterEach(async () => {
    await deleteAgency(db, agencyId);
  });

  async function completedAction(clusterIds: string[]) {
    const api = caller(agencyId);
    const action = await api.actions.create({
      clientId,
      title: "Refresh the comparison page",
      reason: "The page is cited but pricing on it is stale.",
      actionType: "refresh_page",
      estimatedImpact: "high",
      effort: "low",
      affectedClusterIds: clusterIds,
    });

    // Завершаем действие «задним числом», чтобы дата была детерминированной.
    // Через helper из @repo/db: drizzle не должен утекать в apps/web.
    await api.actions.update({ id: action.id, status: "done" });
    await setActionCompletedAt(db, action.id, ACTION_DATE);

    return action;
  }

  it("baseline совпадает с посчитанным вручную взвешенным средним", async () => {
    const action = await completedAction([treatmentClusterId]);
    const { experiment, created } = await caller(agencyId).experiments.createFromAction({
      actionId: action.id,
    });

    expect(created).toBe(true);
    expect(experiment.actionDate.toISOString()).toBe(ACTION_DATE.toISOString());
    expect(experiment.baselineStart.toISOString()).toBe("2026-08-03T00:00:00.000Z");

    const events = await listExperimentEvents(db, experiment.id);
    const shipped = events.find((e) => e.type === "action_shipped");

    // (18×20 + 22×30) / 50 = 20.4 — срез из июня в окно не попал.
    expect(shipped?.payload["baselineVisibilityPct"]).toBe(20.4);
    expect(shipped?.payload["controlVisibilityPct"]).toBe(21);
    expect(shipped?.payload["baselineSnapshots"]).toBe(2);
  });

  it("контрольная группа — кластеры, которых действие не касалось", async () => {
    const action = await completedAction([treatmentClusterId]);
    const { experiment } = await caller(agencyId).experiments.createFromAction({
      actionId: action.id,
    });

    expect(experiment.treatmentClusterIds).toEqual([treatmentClusterId]);
    expect(experiment.controlClusterIds).toEqual([controlClusterId]);
  });

  it("действие по всем кластерам оставляет продукт без контроля — и говорит об этом", async () => {
    const action = await completedAction([treatmentClusterId, controlClusterId]);
    const { warnings } = await caller(agencyId).experiments.createFromAction({
      actionId: action.id,
    });

    // Спек предупреждает: у клиента один бренд, настоящего контроля нет.
    // Слабость обязана дойти до агентства, а не остаться в коде.
    expect(warnings).toContain(EXPERIMENT_WARNINGS.noControl);
  });

  it("незавершённое действие эксперимент не порождает", async () => {
    const api = caller(agencyId);
    const action = await api.actions.create({
      clientId,
      title: "Not done yet",
      reason: "Still in the backlog.",
      actionType: "refresh_page",
      estimatedImpact: "low",
      effort: "low",
      affectedClusterIds: [treatmentClusterId],
    });

    // Без даты завершения нечего отделять от «после».
    await expect(api.experiments.createFromAction({ actionId: action.id })).rejects.toThrow(
      /Complete the action first/,
    );
  });

  it("повторный вызов возвращает существующий эксперимент", async () => {
    const action = await completedAction([treatmentClusterId]);
    const api = caller(agencyId);

    const first = await api.experiments.createFromAction({ actionId: action.id });
    const second = await api.experiments.createFromAction({ actionId: action.id });

    expect(second.created).toBe(false);
    expect(second.experiment.id).toBe(first.experiment.id);
  });

  it("эксперимент чужого агентства недоступен", async () => {
    const action = await completedAction([treatmentClusterId]);
    const { experiment } = await caller(agencyId).experiments.createFromAction({
      actionId: action.id,
    });

    const other = await createAgency(db, { name: "Other Exp" });
    await expect(caller(other.id).experiments.get({ id: experiment.id })).rejects.toThrow();
    await deleteAgency(db, other.id);
  });
});
