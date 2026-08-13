import { EMAIL_COPY } from "./templates";
import type { EmailMessage, EmailSender, SentEmail } from "./types";

/**
 * Живой транспорт писем (Resend).
 *
 * Обращение к API идёт через `fetch`, а не через SDK: сборка герметична, а
 * весь внешний обмен продукта и так живёт за интерфейсами этого пакета.
 * Сеть трогается только здесь; в тестах транспорт получает свой `fetch`.
 */

const ENDPOINT = "https://api.resend.com/emails";

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

export interface ResendEmailSenderConfig {
  apiKey: string;
  /** Адрес отправителя: домен должен быть подтверждён в Resend. */
  from?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ResendEmailSender implements EmailSender {
  private readonly from: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxAttempts: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;

  constructor(private readonly config: ResendEmailSenderConfig) {
    if (!config.apiKey) {
      throw new Error("RESEND_API_KEY is not set. Use EMAIL_MODE=log or provide the key.");
    }

    this.from = config.from ?? EMAIL_COPY.defaultFrom;
    this.endpoint = config.endpoint ?? ENDPOINT;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.maxAttempts = config.maxAttempts ?? 3;
    this.sleep = config.sleep ?? defaultSleep;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async send(message: EmailMessage): Promise<SentEmail> {
    const payload = {
      from: this.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      let response: Response;
      try {
        response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        // Сеть отвалилась — это повторяемо.
        lastError = error instanceof Error ? error : new Error(String(error));
        await this.backoff(attempt);
        continue;
      }

      if (response.ok) {
        const body = (await response.json()) as { id?: string };
        if (!body.id) {
          throw new Error("Resend accepted the request but returned no message id.");
        }
        return { id: body.id };
      }

      const body = await response.text();
      const error = new Error(`Resend responded ${response.status}: ${body.slice(0, 500)}`);
      // Отказ по существу (неверный ключ, неподтверждённый домен) повторять
      // бессмысленно: повтор превратит понятную ошибку в долгое молчание.
      if (!RETRYABLE_STATUSES.has(response.status)) {
        throw error;
      }

      lastError = error;
      await this.backoff(attempt);
    }

    throw lastError ?? new Error("Resend request failed");
  }

  private async backoff(attempt: number): Promise<void> {
    if (attempt < this.maxAttempts) {
      await this.sleep(2 ** (attempt - 1) * 500);
    }
  }
}
