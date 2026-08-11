# STATE.md — память цикла (на диске, не в контексте)

> Обновляется агентом в конце КАЖДОЙ итерации. Секреты сюда не писать.
> Формат записи: дата/итерация, задача, статус, что дальше, блокеры.

## Текущий статус

- Следующая задача: **T13–T15** (live-адаптеры, помечены [H]) — их live-часть требует ключей; при их отсутствии переходить к T16 (worker-скелет).
- Сделано: T00–T07, T10–T12 отмечены; T08 написан но не отмечен (нет remote). Тестов: 48 core + 8 db + 10 tenancy + 8 e2e. Тесты: 4 (db) + 10 (tenancy) + 11 (storage) юнит, 8 e2e.
- Команды проверки: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm e2e`, `pnpm db:migrate`, `pnpm db:check`, `pnpm db:seed`.
- e2e поднимает свой сервер на порту 3100 из production-сборки. Если тесты падают мгновенно и «не видят» правок — на 3100 висит старый процесс: `Get-NetTCPConnection -LocalPort 3100 -State Listen` и `Stop-Process`.
- Порты: Postgres `localhost:5433`, Redis `localhost:6380` (нестандартные, чтобы не конфликтовать с локальными сервисами). Перед работой: `docker compose up -d`, `.env` копируется из `.env.example`.

## Блокеры для человека

- **БЛОКЕР T08: нет удалённого репозитория.** CI-workflow написан, но «зелёный pipeline на PR» проверить негде. Нужно: создать репозиторий на GitHub, `git remote add origin <url>`, `git push -u origin main`, открыть PR. До этого T08 остаётся неотмеченной.
- Цикл работает через `/loop` в приложении. Отдельный скрипт `loop/run-loop.ps1` требует залогиненного CLI (не обязателен): standalone `claude` не залогинен — `claude -p` возвращает `"Not logged in · Please run /login"` (exit 1), поэтому `loop/run-loop.ps1` работать не может. Починка: открыть обычный терминал, выполнить `claude` → `/login`, либо задать `ANTHROPIC_API_KEY` в окружении. Проверить успех: `"Reply with exactly: OK" | claude -p --output-format json --max-turns 1` должен вернуть JSON с `is_error:false`.
  Подтверждено при пробнике: структура JSON корректна, поле `total_cost_usd` присутствует — cost-cap в скрипте будет работать сразу после логина.
- К сведению: окружение с TLS-перехватом — сетевые загрузки на этапе билда падают (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Билд держим герметичным.
- Docker установлен (29.6.2), но контейнеры для T01 ещё не поднимались — проверить, что демон запущен.

## Журнал итераций

### 2026-08-11 · iter 7 (/loop) · T11, T12 — done
- Сделано: контракт C1 + 9 fixtures (T11); MockAdapter с детерминированным выбором и реестр адаптеров (T12).
- Verify: 48 тестов в core зелёные; typecheck/lint/test/build зелёные.
- Дальше: T13–T15 требуют API-ключей (пометка [H]); без ключей их live-часть не проверить — переходить к T16.
- Блокеры: T08 (нет remote); ключи платформ для T13–T15.

### 2026-08-11 · iter 6 (/loop) · T10 — done
- Сделано: схема measurement (7 таблиц, миграция 0002), seed с кластерами/промптами/расписанием, 4 новых теста.
- Verify: 8 тестов db зелёные, seed идемпотентен, типы экспортированы; typecheck/lint/test/build зелёные.
- Дальше: T11 (fixtures).
- Блокеры: только T08 (нет remote).

### 2026-08-11 · iter 5 (/loop) · T04 — done
- Сделано: tRPC-каркас, protectedProcedure/roleProcedure/assertTenant, роутеры agency и clients, приглашения с токеном, /invite/[token], React-провайдер tRPC.
- Verify: 10 юнит-тестов зелёные, включая проверку неразличимости чужого и несуществующего ресурса; typecheck/lint/build/e2e зелёные.
- Вскрыто и починено: vite-tsconfig-paths ESM-only (алиас вручную), zod выровнен до v4.
- Дальше: T05.
- Блокеры: нет.

### 2026-08-11 · iter 4 (/loop, dynamic) · T03 — done
- Сделано: Better Auth email+password поверх `users`, таблицы сессий/аккаунтов/верификаций/приглашений, страницы login/signup, защищённый /dashboard, Playwright-конфиг и первый e2e.
- Verify: `pnpm e2e` 2/2 зелёные; typecheck/lint/build зелёные, юнит-тесты T02 не сломались.
- Вскрыто и починено: ключи schema у drizzle-адаптера должны совпадать с `modelName`; `drizzle-orm` утекал в apps/web (вынесено в `@repo/db/queries`); Next выбирал корнем чужой lockfile (`outputFileTracingRoot`); зависший сервер на 3100 переиспользовался Playwright'ом и маскировал исправления.
- Дальше: T04.
- Блокеры: нет. Цикл работает в приложении (`/loop`), логин CLI нужен только для внешнего скрипта.

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
