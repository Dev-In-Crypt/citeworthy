import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireEnv } from "./env";
import * as schema from "./schema/index";

export type Database = ReturnType<typeof createDb>["db"];

/**
 * Создаёт подключение. Вызывающий отвечает за close() — важно для тестов и скриптов,
 * иначе процесс не завершается.
 */
export function createDb(url: string = requireEnv("DATABASE_URL")) {
  const connection = postgres(url, { max: 10 });
  const db = drizzle(connection, { schema });
  return {
    db,
    close: async (): Promise<void> => {
      await connection.end();
    },
  };
}
