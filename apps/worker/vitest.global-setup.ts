import { prepareTestDatabase } from "@repo/db";

/** Тестовая база создаётся и мигрируется один раз на пакет. */
export async function setup(): Promise<void> {
  await prepareTestDatabase();
}
