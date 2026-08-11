# STATE.md — память цикла (на диске, не в контексте)

> Обновляется агентом в конце КАЖДОЙ итерации. Секреты сюда не писать.
> Формат записи: дата/итерация, задача, статус, что дальше, блокеры.

## Текущий статус

- Следующая задача: **T03** (auth: Better Auth email+password, signup создаёт agency+owner, страницы /login и /signup)
- Сделано: T00, T01, T02. Монорепо собирается, БД поднимается, схема tenancy применена, seed идемпотентен, 4 теста зелёные.
- Команды проверки: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm db:migrate`, `pnpm db:check`, `pnpm db:seed`.
- Порты: Postgres `localhost:5433`, Redis `localhost:6380` (нестандартные, чтобы не конфликтовать с локальными сервисами). Перед работой: `docker compose up -d`, `.env` копируется из `.env.example`.

## Блокеры для человека

- **БЛОКЕР ЦИКЛА: standalone `claude` CLI не залогинен.** `claude -p` возвращает `"Not logged in · Please run /login"` (exit 1), поэтому `loop/run-loop.ps1` работать не может. Починка: открыть обычный терминал, выполнить `claude` → `/login`, либо задать `ANTHROPIC_API_KEY` в окружении. Проверить успех: `"Reply with exactly: OK" | claude -p --output-format json --max-turns 1` должен вернуть JSON с `is_error:false`.
  Подтверждено при пробнике: структура JSON корректна, поле `total_cost_usd` присутствует — cost-cap в скрипте будет работать сразу после логина.
- К сведению: окружение с TLS-перехватом — сетевые загрузки на этапе билда падают (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Билд держим герметичным.
- Docker установлен (29.6.2), но контейнеры для T01 ещё не поднимались — проверить, что демон запущен.

## Журнал итераций

### 2026-08-11 · iter 3 (ручной прогон) · T02 — done
- Сделано: схема tenancy + первая миграция + идемпотентный seed + 4 интеграционных теста.
- Verify: двойной `pnpm db:seed` без дублей, `pnpm --filter @repo/db test` 4/4; typecheck/lint/test/build зелёные.
- Вскрыто и починено: drizzle-kit не резолвит ESM-расширения `.js` (импорты без расширений, правило в CLAUDE.md).
- Дальше: T03.
- Блокеры: цикл заблокирован логином CLI (см. выше).

### 2026-08-11 · iter 2 (ручной прогон) · T01 — done
- Сделано: docker-compose (Postgres 16, Redis 7, healthchecks), Drizzle + postgres.js, `.env.example`, программный мигратор, `db:check`.
- Verify: `docker compose up -d && pnpm db:migrate && pnpm db:check` зелёные; typecheck/lint/test/build зелёные и без warning'ов.
- Вскрыто и починено: dotenv не видел корневой `.env` из папки пакета; `next-env.d.ts` ронял lint; turbo шумел «no output files» (добавлены package-level turbo.json).
- Дальше: T02.
- Блокеры: цикл всё ещё заблокирован логином CLI (см. выше).

### 2026-08-11 · iter 1 (ручной прогон) · T00 — done
- Сделано: монорепо pnpm+Turborepo (apps/web, apps/worker, packages/core, packages/db), общие tsconfig/eslint/prettier, Tailwind v4 с дизайн-токенами из плана §4.3.
- Verify: `pnpm install && pnpm build && pnpm lint` зелёные, дополнительно `pnpm typecheck` и `pnpm test`.
- Вскрыто ручным прогоном (и починено): (1) `next/font/google` ломает билд из-за TLS-перехвата → перешли на font-stack, правило записано в CLAUDE.md; (2) `Get-Content`/`Set-Content` в PowerShell 5.1 портят UTF-8 в русских доках → правило записано в CLAUDE.md; (3) структура репозитория: спеки в `docs/`, операционные файлы в корне.
- Дальше: T01.
- Блокеры: нет.

<!-- новые записи добавлять СВЕРХУ, формат:
### 2026-08-12 · iter 3 · T02 — done
- Сделано: схема tenancy + seed, verify прошёл (pnpm db:seed идемпотентен, юнит-тест зелёный)
- Дальше: T03 auth
- Блокеры: нет
-->
