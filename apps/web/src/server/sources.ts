/**
 * Диагноз по источникам. Одно определение на экран, на публичный API и на
 * пересчёт возможностей — оно живёт в `@repo/pipeline/read-models`, потому что
 * воркеру оно тоже нужно, а импортировать из приложения он не может.
 */
export { clientSources, toCitationFacts, PRESENCE_CAVEAT } from "@repo/pipeline/read-models";
