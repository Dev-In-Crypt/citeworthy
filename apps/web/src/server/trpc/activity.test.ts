import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgency, createClient, createDb, deleteAgency, listActivity } from "@repo/db";
import { appRouter } from "./root";
import type { SessionUser, TrpcContext } from "./context";

/** Verify T41: смена статуса действия создаёт запись в журнале. */

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

describe("activity log", () => {
  let agencyId = "";
  let clientId = "";

  beforeEach(async () => {
    const agency = await createAgency(db, { name: "Activity Agency", clientLimit: 10 });
    agencyId = agency.id;
    const client = await createClient(db, { agencyId, name: "AcmeCRM", domain: "acmecrm.test" });
    clientId = client.id;
  });

  afterEach(async () => {
    await deleteAgency(db, agencyId);
  });

  async function createAction() {
    return caller(agencyId).actions.create({
      clientId,
      title: "Refresh the comparison page",
      reason: "The page is cited but the pricing on it is out of date.",
      actionType: "refresh_page",
      estimatedImpact: "high",
      effort: "low",
      affectedClusterIds: [],
    });
  }

  it("создание действия попадает в журнал", async () => {
    const action = await createAction();
    const entries = await listActivity(db, clientId);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.eventType).toBe("action_created");
    expect(entries[0]?.payload["actionId"]).toBe(action.id);
  });

  it("смена статуса создаёт отдельную запись", async () => {
    const action = await createAction();
    await caller(agencyId).actions.update({ id: action.id, status: "in_progress" });

    const entries = await listActivity(db, clientId);
    const statusEvent = entries.find((e) => e.eventType === "action_status_changed");

    expect(statusEvent).toBeDefined();
    expect(statusEvent?.payload["from"]).toBe("backlog");
    expect(statusEvent?.payload["to"]).toBe("in_progress");
  });

  it("завершение — отдельное событие, а не просто смена статуса", async () => {
    const action = await createAction();
    await caller(agencyId).actions.update({ id: action.id, status: "done" });

    const entries = await listActivity(db, clientId);
    // Именно это событие попадёт в клиентский отчёт и станет точкой отсчёта
    // для эксперимента, поэтому оно должно отличаться от прочих смен статуса.
    expect(entries.some((e) => e.eventType === "action_completed")).toBe(true);
  });

  it("повторная запись того же статуса журнал не засоряет", async () => {
    const action = await createAction();
    await caller(agencyId).actions.update({ id: action.id, status: "done" });
    await caller(agencyId).actions.update({ id: action.id, status: "done" });

    const completed = (await listActivity(db, clientId)).filter(
      (e) => e.eventType === "action_completed",
    );
    expect(completed).toHaveLength(1);
  });

  it("журнал возвращается в обратном хронологическом порядке", async () => {
    const first = await createAction();
    await caller(agencyId).actions.update({ id: first.id, status: "in_progress" });

    const entries = await caller(agencyId).actions.activity({ clientId });
    expect(entries[0]?.eventType).toBe("action_status_changed");
    expect(entries.at(-1)?.eventType).toBe("action_created");
  });

  it("журнал чужого клиента недоступен", async () => {
    const other = await createAgency(db, { name: "Other Activity" });

    await expect(caller(other.id).actions.activity({ clientId })).rejects.toThrow();

    await deleteAgency(db, other.id);
  });
});
