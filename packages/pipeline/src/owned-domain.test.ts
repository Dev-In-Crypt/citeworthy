import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAgency,
  createClient,
  createDb,
  createRun,
  deleteAgency,
  getSourceByDomain,
  listCitationFacts,
} from "@repo/db";
import { promptClusters, prompts } from "@repo/db/schema/measurement";
import { sources } from "@repo/db/schema/sources";
import { completeRun } from "./complete-run";

/**
 * Владение доменом — свойство пары (клиент, домен), а не самого домена.
 *
 * Таблица `sources` общая на все агентства: если записать туда «owned»,
 * домен одного клиента станет собственным для всех, кто его процитировал —
 * и чужому клиенту предложат обновить не его страницы.
 */

const { db, close } = createDb();

afterAll(async () => {
  await close();
});

async function seedClient(agencyId: string, name: string, domain: string) {
  const client = await createClient(db, {
    agencyId,
    name,
    domain,
    brandNames: [name],
    competitorNames: ["HubSpot", "Pipedrive"],
  });

  const clusterId = (
    await db
      .insert(promptClusters)
      .values({ clientId: client.id, name: "CRM comparison", intent: "comparison" })
      .returning()
  )[0]!.id;

  await db.insert(prompts).values({ clusterId, text: "best CRM for startups" });

  const run = await createRun(db, { clientId: client.id, scheduleId: null, trigger: "manual" });
  await completeRun(db, run.id, client.id, "mock");

  return client;
}

describe("owned домен не утекает между клиентами", () => {
  let agencyId = "";

  beforeEach(async () => {
    await db.delete(sources);
    agencyId = (await createAgency(db, { name: "Owned Agency", clientLimit: 10 })).id;
  });

  afterEach(async () => {
    await deleteAgency(db, agencyId);
  });

  it("свой домен помечается owned для своего клиента", async () => {
    // Фикстуры mock-адаптеров цитируют acmecrm.test — он и будет «своим».
    const acme = await seedClient(agencyId, "AcmeCRM", "acmecrm.test");

    const facts = await listCitationFacts(db, acme.id, null);
    const own = facts.find((fact) => fact.domain === "acmecrm.test");

    expect(own?.sourceType).toBe("owned");
  });

  it("тот же домен у другого клиента остаётся чужим", async () => {
    const acme = await seedClient(agencyId, "AcmeCRM", "acmecrm.test");
    const northwind = await seedClient(agencyId, "Northwind CRM", "northwind-crm.test");

    const acmeFacts = await listCitationFacts(db, acme.id, null);
    expect(acmeFacts.find((fact) => fact.domain === "acmecrm.test")?.sourceType).toBe("owned");

    const foreignFacts = await listCitationFacts(db, northwind.id, null);
    const sameDomain = foreignFacts.find((fact) => fact.domain === "acmecrm.test");

    // Главное: чужому клиенту этот домен не показывается как его собственный.
    expect(sameDomain?.sourceType).not.toBe("owned");
  });

  it("в общей таблице источников домен клиента не помечен owned", async () => {
    await seedClient(agencyId, "AcmeCRM", "acmecrm.test");

    const cached = await getSourceByDomain(db, "acmecrm.test");
    expect(cached?.sourceType).not.toBe("owned");
  });
});
