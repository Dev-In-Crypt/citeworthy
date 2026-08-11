/**
 * Worker: BullMQ-процессы runs / parse / aggregate.
 * Очереди подключаются в T16; сейчас — скелет с graceful shutdown.
 */

function main(): void {
  console.log("[worker] started (skeleton, no queues yet)");
}

function shutdown(signal: string): void {
  console.log(`[worker] received ${signal}, shutting down`);
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main();
