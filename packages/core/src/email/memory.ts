import { createLogger, type LogFields, type Logger } from "../observability/logger";
import type { EmailMessage, EmailSender, SentEmail } from "./types";

/**
 * Отправитель, который ничего не отправляет.
 *
 * Это рабочий режим по умолчанию, а не заглушка на время: без ключа продукт
 * обязан оставаться пригодным — приглашение и сброс пароля работают по ссылке,
 * которую интерфейс показывает сам. Письма складываются в память, чтобы их
 * можно было увидеть в тестах и в логе разработки.
 */

/** Сколько писем держать в памяти: режим работает месяцами, список расти вечно не может. */
const DEFAULT_LIMIT = 200;

export class MemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  private counter = 0;
  private readonly limit: number;

  constructor(
    private readonly log: ((message: EmailMessage) => void) | null = null,
    limit: number = DEFAULT_LIMIT,
  ) {
    this.limit = Math.max(1, limit);
  }

  send(message: EmailMessage): Promise<SentEmail> {
    this.counter += 1;
    this.sent.push(message);
    // Старые письма вытесняются: нужен хвост, а не вся история процесса.
    if (this.sent.length > this.limit) this.sent.splice(0, this.sent.length - this.limit);
    this.log?.(message);
    return Promise.resolve({ id: `memory-${this.counter}` });
  }

  /** Последнее письмо адресату — этим пользуются тесты. */
  lastTo(email: string): EmailMessage | undefined {
    return [...this.sent].reverse().find((message) => message.to === email);
  }

  clear(): void {
    this.sent.length = 0;
  }
}

/**
 * Поля письма для структурной записи.
 *
 * Тело кладётся целиком и намеренно: без транспорта лог — единственное место,
 * где остаётся ссылка на приглашение и на смену пароля. Другого канала для
 * неё нет, и терять её нельзя.
 */
export function emailLogFields(message: EmailMessage): LogFields {
  return {
    to: message.to,
    subject: message.subject,
    fromName: message.fromName,
    replyTo: message.replyTo,
    // Разметка в лог не идёт: читать её некому, а строку она раздувает.
    htmlBytes: message.html ? message.html.length : undefined,
    body: message.text,
  };
}

/** Запись письма поверх переданного логгера — так её подменяют в тестах. */
export function createEmailLog(logger: Logger): (message: EmailMessage) => void {
  return (message) => {
    logger.info("email.logged", emailLogFields(message));
  };
}

/**
 * Письмо, которое транспорт так и не принял.
 *
 * Уровень error и то же тело: отказ доставки не должен означать потерю
 * содержимого — по этой строке человека можно довести до нужной страницы
 * руками.
 */
export function createEmailFailureLog(
  logger: Logger,
): (message: EmailMessage, error: Error) => void {
  return (message, error) => {
    logger.error("email.failed", { ...emailLogFields(message), error });
  };
}

function stdoutLogger(): Logger {
  return createLogger({
    sink: (line) => {
      process.stdout.write(`${line}\n`);
    },
    base: { service: "email" },
  });
}

/**
 * Пишет письмо целиком одной структурной строкой: разбирать свободный текст
 * грепом через полгода — отдельная работа (тот же довод, что у логов воркера).
 */
export const consoleEmailLog: (message: EmailMessage) => void = createEmailLog(stdoutLogger());

export const consoleEmailFailureLog: (message: EmailMessage, error: Error) => void =
  createEmailFailureLog(stdoutLogger());
