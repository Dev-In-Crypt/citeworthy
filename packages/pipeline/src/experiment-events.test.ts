import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAgency,
  createClient,
  createDb,
  createExperiment,
  createPrompt,
  createPromptCluster,
  createResponse,
  createRun,
  deleteAgency,
  listExperimentEvents,
  replaceCitations,
  upsertVisibilitySnapshot,
} from "@repo/db";
import { experiments } from "@repo/db/schema/experiments";
import { detectExperimentEvents } from "./experiment-events";

/** Verify T44: новая цитата после действия порождает ровно одно событие. */

const { db, close } = createDb();

afterAll(async () => {
  await close();
});

const ACTION_DATE = new Date("2026-08-31T00:00:00Z");

describe("detectExperimentEvents", () => {
  let agencyId = "";
  let clientId = "";
  let clusterId = "";
  let promptId = "";
  let runId = "";
  let experimentId = "";

  beforeEach(async () => {
    const agency = await createAgency(db, { name: "Events Agency", clientLimit: 10 });
    agencyId = agency.id;
    const client = await createClient(db, { agencyId, name: "AcmeCRM", domain: "acmecrm.test" });
    clientId = client.id;

    clusterId = (await createPromptCluster(db, { clientId, name: "c", intent: "comparison" })).id;
    promptId = (await createPrompt(db, { clusterId, text: "best CRM for startups" })).id;
    runId = (await createRun(db, { clientId, trigger: "manual" })).id;

    experimentId = (
      await createExperiment(db, {
        clientId,
        actionId: (await createActionRow()).id,
        actionDate: ACTION_DATE,
        baselineStart: new Date("2026-08-03T00:00:00Z"),
        baselineEnd: ACTION_DATE,
        treatmentClusterIds: [clusterId],
        controlClusterIds: [],
        controlPromptIds: [],
        status: "collecting",
      })
    ).id;
  });

  async function createActionRow() {
    const { createAction } = await import("@repo/db");
    return createAction(db, {
      clientId,
      title: "Refresh the page",
      reason: "The page is cited but stale.",
      actionType: "refresh_page",
      completedAt: ACTION_DATE,
    });
  }

  /** Кладёт ответ с заданной датой и списком процитированных доменов. */
  async function addResponse(observedAt: Date, domains: string[], sampleIndex: number) {
    const response = await createResponse(db, {
      runId,
      promptId,
      platform: "chatgpt",
      modelVersion: "test-model",
      sampleIndex,
      rawText: "answer",
      createdAt: observedAt,
    });

    await replaceCitations(
      db,
      response.id,
      domains.map((domain, index) => ({
        responseId: response.id,
        url: `https://${domain}/page`,
        domain,
        title: null,
        position: index + 1,
      })),
    );
  }

  afterEach(async () => {
    await deleteAgency(db, agencyId);
  });

  it("новая цитата после действия даёт ровно одно событие", async () => {
    await addResponse(new Date("2026-08-20T00:00:00Z"), ["g2.com"], 0);
    await addResponse(new Date("2026-09-07T00:00:00Z"), ["g2.com", "forbes.com"], 1);

    await detectExperimentEvents(db, clientId);

    const events = (await listExperimentEvents(db, experimentId)).filter(
      (e) => e.type === "first_new_citation",
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.note).toBe("forbes.com");
    expect(events[0]?.payload["daysAfterAction"]).toBe(7);
  });

  it("повторный запуск дубля не создаёт", async () => {
    await addResponse(new Date("2026-08-20T00:00:00Z"), ["g2.com"], 0);
    await addResponse(new Date("2026-09-07T00:00:00Z"), ["forbes.com"], 1);

    await detectExperimentEvents(db, clientId);
    await detectExperimentEvents(db, clientId);

    // Агрегация идёт после каждого прогона: без идемпотентности таймлайн
    // за месяц превратился бы в поток дублей.
    const events = (await listExperimentEvents(db, experimentId)).filter(
      (e) => e.type === "first_new_citation",
    );
    expect(events).toHaveLength(1);
  });

  it("цитата только со старого домена события не порождает", async () => {
    await addResponse(new Date("2026-08-20T00:00:00Z"), ["g2.com"], 0);
    await addResponse(new Date("2026-09-07T00:00:00Z"), ["g2.com"], 1);

    await detectExperimentEvents(db, clientId);

    expect(await listExperimentEvents(db, experimentId)).toHaveLength(0);
  });

  it("сдвиг видимости выше порога попадает на таймлайн", async () => {
    const weeks: [string, number][] = [
      // baseline: две недели по 18%
      ["2026-08-10T00:00:00Z", 18],
      ["2026-08-17T00:00:00Z", 18],
      // после действия: 34%
      ["2026-09-07T00:00:00Z", 34],
    ];

    for (const [week, pct] of weeks) {
      await upsertVisibilitySnapshot(db, {
        clientId,
        clusterId,
        platform: null,
        periodStart: new Date(week),
        periodEnd: new Date(new Date(week).getTime() + 7 * 24 * 60 * 60 * 1000),
        clientVisibilityPct: pct.toFixed(1),
        competitorVisibility: {},
        sampleCount: 20,
        sufficient: true,
      });
    }

    await detectExperimentEvents(db, clientId);

    const change = (await listExperimentEvents(db, experimentId)).find(
      (e) => e.type === "visibility_change",
    );
    expect(change).toBeDefined();
    expect(change?.payload["deltaPp"]).toBe(16);
  });

  it("завершённый эксперимент не трогается", async () => {
    await db.update(experiments).set({ status: "ready" }).where(eq(experiments.id, experimentId));
    await addResponse(new Date("2026-09-07T00:00:00Z"), ["forbes.com"], 0);

    await detectExperimentEvents(db, clientId);

    expect(await listExperimentEvents(db, experimentId)).toHaveLength(0);
  });
});
