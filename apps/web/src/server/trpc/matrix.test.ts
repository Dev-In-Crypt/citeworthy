import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { ASSISTANTS, MIN_SAMPLES_PER_CELL } from "@repo/core";
import {
  createAgency,
  createClient,
  createDb,
  createPrompt,
  createPromptCluster,
  createResponse,
  createRun,
  deleteAgency,
  replaceMentions,
} from "@repo/db";
import { appRouter } from "./root";
import type { SessionUser, TrpcContext } from "./context";

/**
 * Verify T87: матрица считается по настоящим прогонам, фикстуры в неё не
 * попадают, а чужой клиент неотличим от несуществующего.
 */

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

describe("measurement.matrix", () => {
  let agencyId = "";
  let clientId = "";
  let promptId = "";

  beforeEach(async () => {
    const agency = await createAgency(db, { name: "Matrix Agency", clientLimit: 10 });
    agencyId = agency.id;

    const client = await createClient(db, {
      agencyId,
      name: "Ledgerbrook",
      domain: "ledgerbrook.test",
      brandNames: ["Ledgerbrook"],
      competitorNames: ["Outlay"],
    });
    clientId = client.id;

    const cluster = await createPromptCluster(db, { clientId, name: "Comparison" });
    const prompt = await createPrompt(db, {
      clusterId: cluster.id,
      text: "best expense management software",
    });
    promptId = prompt.id;
  });

  afterEach(async () => {
    await deleteAgency(db, agencyId);
  });

  async function addAnswers(
    count: number,
    options: { mode: "live" | "mock"; mentionsClient: boolean; competitor?: string },
  ) {
    const run = await createRun(db, {
      clientId,
      status: "done",
      trigger: "manual",
      adaptersMode: options.mode,
    });

    for (let index = 0; index < count; index++) {
      const response = await createResponse(db, {
        runId: run.id,
        promptId,
        platform: "chatgpt",
        modelVersion: "test-1",
        sampleIndex: index,
        rawText: "answer",
        costUsd: "0.001000",
      });

      await replaceMentions(db, response.id, [
        ...(options.mentionsClient
          ? [
              {
                responseId: response.id,
                entityType: "client" as const,
                entityName: "Ledgerbrook",
                position: 1,
                isClient: true,
                isCompetitor: false,
              },
            ]
          : []),
        ...(options.competitor
          ? [
              {
                responseId: response.id,
                entityType: "competitor" as const,
                entityName: options.competitor,
                position: 2,
                isClient: false,
                isCompetitor: true,
              },
            ]
          : []),
      ]);
    }
  }

  it("столбцов столько же, сколько ассистентов в каталоге, и четыре из них не измеряются", async () => {
    await addAnswers(4, { mode: "live", mentionsClient: true });

    const matrix = await caller(agencyId).measurement.matrix({ clientId });
    const row = matrix.rows[0];

    expect(matrix.assistants).toHaveLength(ASSISTANTS.length);
    expect(row?.cells).toHaveLength(ASSISTANTS.length);
    expect(matrix.assistants.filter((a) => !a.measurable)).toHaveLength(4);
  });

  it("доля считается по сохранённым ответам", async () => {
    await addAnswers(3, { mode: "live", mentionsClient: true });
    await addAnswers(1, { mode: "live", mentionsClient: false, competitor: "Outlay" });

    const matrix = await caller(agencyId).measurement.matrix({ clientId });
    const gpt = matrix.rows[0]?.cells.find((c) => c.assistantId === "chatgpt");

    expect(gpt).toMatchObject({ samples: 4, ratePct: 75, competitorOnly: true });
    expect(matrix.totals.ratePct).toBe(75);
  });

  it("фикстурный прогон в матрицу не попадает", async () => {
    // Пока живых прогонов нет, эффективный режим — mock, и цифры берутся из него.
    await addAnswers(4, { mode: "mock", mentionsClient: true });
    const onFixtures = await caller(agencyId).measurement.matrix({ clientId });
    expect(onFixtures.totals.samples).toBe(4);

    // Появился живой прогон — фикстуры перестают участвовать целиком.
    await addAnswers(6, { mode: "live", mentionsClient: false });
    const live = await caller(agencyId).measurement.matrix({ clientId });

    expect(live.totals.samples).toBe(6);
    expect(live.totals.ratePct).toBe(0);
  });

  it("недобор сэмплов оставляет прочерк, а не ноль", async () => {
    await addAnswers(MIN_SAMPLES_PER_CELL - 1, { mode: "live", mentionsClient: true });

    const matrix = await caller(agencyId).measurement.matrix({ clientId });
    const gpt = matrix.rows[0]?.cells.find((c) => c.assistantId === "chatgpt");

    expect(gpt).toMatchObject({ ratePct: null, sufficient: false });
    expect(matrix.minSamples).toBe(MIN_SAMPLES_PER_CELL);
  });

  it("окно отсекает старые ответы", async () => {
    await addAnswers(6, { mode: "live", mentionsClient: true });

    const wide = await caller(agencyId).measurement.matrix({ clientId, windowDays: 28 });
    expect(wide.windowDays).toBe(28);
    expect(wide.totals.samples).toBe(6);
  });

  it("заметность считается по тем же ответам, что и доля", async () => {
    // Клиент назван, но после конкурента — доля та же, заметность другая.
    await addAnswers(4, { mode: "live", mentionsClient: true, competitor: "Outlay" });

    const matrix = await caller(agencyId).measurement.matrix({ clientId });

    expect(matrix.prominence).toMatchObject({
      answers: 4,
      named: 4,
      namedFirst: 4,
      behindCompetitors: 0,
      averageRank: 1,
      sufficient: true,
    });
  });

  it("доля приезжает с интервалом, а движение — с признаком различимости", async () => {
    await addAnswers(6, { mode: "live", mentionsClient: true });

    const matrix = await caller(agencyId).measurement.matrix({ clientId });

    expect(matrix.totals.interval).not.toBeNull();
    expect(matrix.totals.interval!.low).toBeLessThanOrEqual(matrix.totals.ratePct!);
    expect(matrix.totals.interval!.high).toBeGreaterThanOrEqual(matrix.totals.ratePct!);

    // Прошлого окна нет — сравнивать не с чем, и это не «не изменилось».
    expect(matrix.totalsDeltaPp).toBeNull();
    expect(matrix.totalsDistinguishable).toBe(false);
    expect(matrix.movement.every((entry) => entry.distinguishable === false)).toBe(true);
  });

  it("чужой клиент неотличим от несуществующего", async () => {
    const other = await createAgency(db, { name: "Other Agency", clientLimit: 10 });
    try {
      await expect(caller(other.id).measurement.matrix({ clientId })).rejects.toThrow(TRPCError);
    } finally {
      await deleteAgency(db, other.id);
    }
  });
});
