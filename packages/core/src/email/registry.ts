import { MemoryEmailSender, consoleEmailLog } from "./memory";
import { ResendEmailSender } from "./resend";
import type { EmailSender } from "./types";

/**
 * Выбор транспорта писем — по тому же правилу, что и адаптеры платформ:
 * умолчание безопасное (никуда не ходим), живой режим включается явно и
 * только при наличии ключа.
 */

export type EmailMode = "log" | "live";

export function parseEmailMode(raw: string | undefined): EmailMode {
  if (raw === "live") return "live";
  if (raw === undefined || raw === "" || raw === "log") return "log";
  throw new Error(`Invalid EMAIL_MODE="${raw}". Use "log" or "live".`);
}

/**
 * Собирает отправителя из окружения.
 *
 * Живой режим без ключа — ошибка при старте, а не тихая подмена на лог:
 * агентство, которое включило почту, должно узнать об этом сразу, а не по
 * жалобе сотрудника, не получившего приглашение.
 */
export function createEmailSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  const mode = parseEmailMode(env["EMAIL_MODE"]?.trim());
  if (mode === "log") {
    return new MemoryEmailSender(consoleEmailLog);
  }

  const apiKey = env["RESEND_API_KEY"]?.trim();
  if (!apiKey) {
    throw new Error("EMAIL_MODE=live requires RESEND_API_KEY.");
  }

  const from = env["EMAIL_FROM"]?.trim();
  return new ResendEmailSender({ apiKey, ...(from ? { from } : {}) });
}
