import { createEmailSender, type EmailSender } from "@repo/core";

/**
 * Отправитель писем на процесс.
 *
 * Создаётся лениво: модуль импортируется и в сборке, и в тестах, а падать
 * из-за EMAIL_MODE=live без ключа он должен при первой отправке, а не при
 * сборке страницы, которая писем не шлёт.
 */
let sender: EmailSender | null = null;

export function getEmailSender(): EmailSender {
  sender ??= createEmailSender();
  return sender;
}

/** Подменяется в тестах, чтобы проверить, что письмо действительно собрано. */
export function setEmailSender(next: EmailSender | null): void {
  sender = next;
}

/**
 * Базовый адрес приложения — из него строятся ссылки в письмах.
 *
 * Настройка проверяется здесь, а не у получателя: адрес без схемы даёт
 * ссылку, которая в почтовом клиенте никуда не ведёт, и ошибка всплыла бы
 * жалобой человека, не сумевшего принять приглашение.
 */
export function appUrl(): string {
  const configured = (
    process.env["NEXT_PUBLIC_APP_URL"] ??
    process.env["BETTER_AUTH_URL"] ??
    "http://localhost:3000"
  ).trim();

  if (!/^https?:\/\/\S/i.test(configured)) {
    throw new Error(
      `NEXT_PUBLIC_APP_URL must be an absolute http(s) URL, received "${configured}".`,
    );
  }

  return configured.replace(/\/+$/, "");
}
