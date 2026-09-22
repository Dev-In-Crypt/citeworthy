import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";

/**
 * Сбор ошибок консоли для страниц витрины.
 *
 * Файлы шрифтов витрины (Newsreader, IBM Plex Mono) добавляются в
 * public/fonts отдельно. Пока файла нет, браузер пишет в консоль 404 — это не
 * ошибка страницы: вместо шрифта берётся следующий из стека. Как только файл
 * появится, исключение перестаёт действовать само, и настоящий 404 шрифта
 * снова уронит тест.
 */
const FONTS_DIR = resolve(__dirname, "../public/fonts");

function isPendingFont(url: string): boolean {
  const match = url.match(/\/fonts\/((?:Newsreader|IBMPlexMono)-[\w-]+\.woff2)$/);
  return Boolean(match?.[1] && !existsSync(resolve(FONTS_DIR, match[1])));
}

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (isPendingFont(message.location().url)) return;
    errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
