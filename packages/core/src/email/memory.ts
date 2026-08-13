import type { EmailMessage, EmailSender, SentEmail } from "./types";

/**
 * Отправитель, который ничего не отправляет.
 *
 * Это рабочий режим по умолчанию, а не заглушка на время: без ключа продукт
 * обязан оставаться пригодным — приглашение и сброс пароля работают по ссылке,
 * которую интерфейс показывает сам. Письма складываются в память, чтобы их
 * можно было увидеть в тестах и в логе разработки.
 */
export class MemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  constructor(private readonly log: ((message: EmailMessage) => void) | null = null) {}

  send(message: EmailMessage): Promise<SentEmail> {
    this.sent.push(message);
    this.log?.(message);
    return Promise.resolve({ id: `memory-${this.sent.length}` });
  }

  /** Последнее письмо адресату — этим пользуются тесты. */
  lastTo(email: string): EmailMessage | undefined {
    return [...this.sent].reverse().find((message) => message.to === email);
  }

  clear(): void {
    this.sent.length = 0;
  }
}

/** Пишет в консоль ссылку из письма: без транспорта её больше взять негде. */
export function consoleEmailLog(message: EmailMessage): void {
  console.log(`[email] to=${message.to} subject="${message.subject}"\n${message.text}`);
}
