import { eq } from "drizzle-orm";
import type { Database } from "./client";
import { agencies, clients } from "./schema/tenancy";
import type { Agency, Client } from "./schema/tenancy";

/**
 * Запросы живут здесь, а не в приложениях: drizzle не должен утекать за границу @repo/db.
 * Tenancy-проверки добавляются в T04 (assertTenant) — эти функции их не заменяют.
 */

export async function getAgencyById(db: Database, agencyId: string): Promise<Agency | undefined> {
  const rows = await db.select().from(agencies).where(eq(agencies.id, agencyId)).limit(1);
  return rows[0];
}

export async function listClientsByAgency(db: Database, agencyId: string): Promise<Client[]> {
  return db.select().from(clients).where(eq(clients.agencyId, agencyId));
}
