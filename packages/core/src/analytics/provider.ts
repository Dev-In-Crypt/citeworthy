import type { TrafficRow } from "./referrers";

/**
 * Источник данных аналитики.
 *
 * За интерфейсом по тем же причинам, что платформы, почта и оплата: живое
 * подключение к GA4 требует доступов от каждого клиента агентства, а продукт
 * обязан работать до того, как их дадут. Импорт выгрузки — не заглушка на
 * время, а рабочий путь: он не зависит от чужих доступов вовсе.
 */

export interface TrafficQuery {
  propertyId: string;
  from: Date;
  to: Date;
}

export interface AnalyticsProvider {
  /** Подключено ли живое чтение. Интерфейс не должен обещать того, чего нет. */
  readonly configured: boolean;
  fetchTraffic(query: TrafficQuery): Promise<TrafficRow[]>;
}

export class AnalyticsNotConnectedError extends Error {
  constructor() {
    super(
      "No analytics connection is configured. Import a traffic export instead, or set the Google Analytics credentials.",
    );
    this.name = "AnalyticsNotConnectedError";
  }
}

/** Провайдер по умолчанию: сам ничего не читает и не притворяется, что читает. */
export class UnconnectedAnalyticsProvider implements AnalyticsProvider {
  readonly configured = false;

  fetchTraffic(): Promise<TrafficRow[]> {
    return Promise.reject(new AnalyticsNotConnectedError());
  }
}

/**
 * Живое чтение появится здесь же, за тем же интерфейсом: GA4 Data API
 * подключается двумя переменными окружения, и путь импорта остаётся.
 */
export function createAnalyticsProvider(
  env: NodeJS.ProcessEnv = process.env,
): AnalyticsProvider {
  const credentials = env["GA4_CREDENTIALS_JSON"]?.trim();
  if (!credentials) {
    return new UnconnectedAnalyticsProvider();
  }

  throw new Error(
    "GA4_CREDENTIALS_JSON is set, but the live Google Analytics reader is not implemented yet. Unset it to use imports.",
  );
}
