/**
 * Адрес тестовой базы.
 *
 * Тесты работают на отдельной базе, а не на рабочей: часть из них чистит
 * глобальную таблицу источников (она намеренно не привязана к агентству),
 * и на общей базе один прогон тестов стирал классификацию всех клиентов —
 * диагностика после этого менялась без новых измерений.
 *
 * Имя выводится из рабочего адреса, чтобы не держать вторую строку
 * подключения: сменили пароль или порт — тестовая база переехала следом.
 */

export function databaseNameOf(url: string): string {
  const path = new URL(url).pathname.replace(/^\//, "");
  if (path === "") {
    throw new Error(`No database name in "${url}"`);
  }
  return path;
}

export function testDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  const name = databaseNameOf(url);

  // Повторный вызов ничего не портит: суффикс не наращивается.
  parsed.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`;
  return parsed.toString();
}

/** Адрес служебной базы: создавать другую базу можно только не находясь в ней. */
export function adminDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  parsed.pathname = "/postgres";
  return parsed.toString();
}
