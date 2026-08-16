import type { Database } from "@repo/db";
import { generateOpportunities } from "./opportunity-job";

/**
 * Пересчёт возможностей в хвосте прогона — так, чтобы его падение не роняло
 * сам прогон.
 *
 * Измерение — фундамент, возможности из него выводятся. Ошибка в оценке или в
 * детекторе не должна помечать провалившимся прогон, в котором ответы уже
 * получены, разобраны и посчитаны: возможности пересчитываются на следующем
 * заходе, а потерянные ответы не возвращаются.
 *
 * Ошибка не проглатывается молча — она отдаётся вызывающему коду, чтобы тот
 * записал её туда, где смотрит человек.
 */
export async function refreshOpportunities(
  db: Database,
  clientId: string,
  onError?: (error: unknown) => void,
): Promise<number> {
  try {
    const outcome = await generateOpportunities(db, clientId);
    return outcome.detected;
  } catch (error) {
    onError?.(error);
    return 0;
  }
}
