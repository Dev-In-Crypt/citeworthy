import "./env";
import { prepareTestDatabase } from "./test-setup";

/**
 * Точка входа для прогонов, которые поднимают настоящее приложение (e2e):
 * vitest готовит тестовую базу своим globalSetup, а Playwright запускает
 * приложение отдельным процессом и делает это до тестов, отдельной командой.
 */
await prepareTestDatabase();
console.log("[db] Test database ready.");
