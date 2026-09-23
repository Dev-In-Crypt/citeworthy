# Образ воркера: прогоны по расписанию, разбор ответов, свёртки.
#
# Отдельный образ, а не тот же процесс, что веб: прогон занимает минуты и
# упирается в лимиты платформ, и делить его с обработкой HTTP-запросов
# значит ронять интерфейс из-за чужого таймаута.
#
# Браузера здесь нет намеренно: PDF печатает веб-процесс, открывая ту же
# публичную страницу, что видит клиент (apps/web/src/server/report-pdf.ts).
# Второй Chromium в этом образе был бы сотней лишних мегабайт, которую никто
# не запускает.

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
# Кэш corepack — в общий путь, а не в домашний каталог root.
#
# Версия pnpm закреплена в package.json, и corepack скачивает её при первом
# вызове. Лёжа в /root/.cache, она недоступна непривилегированному
# пользователю: разовая служба миграций полезла бы в сеть за уже скачанным
# и упала бы там, где сети нет.
ENV COREPACK_HOME="/opt/corepack"
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/pipeline/package.json packages/pipeline/
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile

FROM deps AS runner
ENV NODE_ENV=production

# Непривилегированный пользователь: воркеру root не нужен ни для одной задачи.
#
# uid и gid совпадают с веб-образом намеренно: контейнеры делят том с сырыми
# ответами, и разные владельцы означали бы, что один не читает то, что записал
# другой.
#
# Пользователь заводится до копирования исходников: иначе рекурсивная смена
# владельца ложится поверх свежего большого слоя и стоит минуты на ровном месте.
# Владеть исходниками воркеру не нужно — он их только читает.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs --home /home/worker worker \
    && chmod -R a+rX /opt/corepack

COPY . .

# Каталог хранилища создаётся до монтирования тома и с нужным владельцем:
# свежий именованный том наследует права точки монтирования из образа, иначе
# процесс без root не сможет положить в него сырой ответ.
RUN mkdir -p /data/storage && chown worker:nodejs /data/storage

# Проверка живости.
#
# HTTP-порта у воркера нет, поэтому проверяется то, ради чего он существует:
# доступность Redis и наличие подписчика на очереди. Живой процесс, потерявший
# очередь, — самый неприятный случай: контейнер работает, логи молчат,
# измерений нет, и узнаёт об этом агентство через неделю по пустому отчёту.
#
# Список подписчиков приходит из `CLIENT LIST`, и управляемый Redis может его
# запретить. Тогда проверка не краснеет попусту, а опирается на один PING:
# ложное «всё сломалось» хуже, чем проверка послабее.
#
# Файл пишется здесь, а не лежит в репозитории: он часть упаковки, а не кода
# воркера. Рядом с исходниками его бы рано или поздно запустили в разработке.
RUN printf '%s\n' \
  'import IORedis from "ioredis";' \
  'import { Queue } from "bullmq";' \
  '' \
  'const TIMEOUT_MS = 4000;' \
  'const url = process.env.REDIS_URL || "redis://redis:6379";' \
  '' \
  'function fail(reason) {' \
  '  console.error("worker healthcheck: " + reason);' \
  '  process.exit(1);' \
  '}' \
  '' \
  'setTimeout(() => fail("timed out"), TIMEOUT_MS).unref();' \
  '' \
  'const connection = new IORedis(url, {' \
  '  maxRetriesPerRequest: null,' \
  '  connectTimeout: 2000,' \
  '  lazyConnect: true,' \
  '});' \
  '' \
  'try {' \
  '  await connection.connect();' \
  '  await connection.ping();' \
  '  const queue = new Queue("run-finalize", { connection });' \
  '  let attached = null;' \
  '  try {' \
  '    attached = (await queue.getWorkers()).length;' \
  '  } catch {' \
  '    attached = null;' \
  '  }' \
  '  if (attached === 0) fail("no consumer attached to the run queues");' \
  '  process.exit(0);' \
  '} catch (error) {' \
  '  fail(error instanceof Error ? error.message : String(error));' \
  '}' \
  > /repo/apps/worker/healthcheck.mjs \
  && chown worker:nodejs /repo/apps/worker/healthcheck.mjs

USER worker

# Каталог воркера, а не корень репозитория: отсюда резолвится tsx. Разовой
# службе миграций нужен корень — она задаёт working_dir в compose-файле.
WORKDIR /repo/apps/worker

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD ["node", "healthcheck.mjs"]

# Воркер запускается из исходников через tsx: сборки в JS у него нет, и
# вводить её ради одного процесса — лишний шаг, который разъедется с dev.
#
# node зовётся напрямую, а не через `pnpm run`: обработчики SIGTERM в
# src/index.ts закрывают очереди и дожидаются текущих задач, но сигнал до них
# доходит только если процесс приложения — он сам, а не обёртка пакетного
# менеджера. Иначе остановка выглядела бы как убийство на середине прогона.
CMD ["node", "--disable-warning=ExperimentalWarning", "--import", "tsx", "src/index.ts"]
