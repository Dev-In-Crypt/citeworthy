import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Побочный импорт: он же подтягивает корневой .env, где и лежит ключ.
import "../packages/db/src/env";
// Пути относительные, а не "@repo/core": скрипт лежит в корне репозитория и
// не принадлежит ни одному пакету, поэтому имя воркспейса отсюда не резолвится.
import { DEFAULT_GEMINI_MODEL, GeminiAdapter } from "../packages/core/src/adapters/gemini";
import { parseAdaptersMode } from "../packages/core/src/adapters/registry";
import type { AdapterResult } from "../packages/core/src/adapters/types";

/**
 * Живая проверка Gemini: ровно один настоящий запрос, чтобы убедиться, что
 * ключ работает и ответ всё ещё той формы, которую разбирает адаптер.
 *
 * Запуск (нужен GEMINI_API_KEY в окружении или в .env воркера):
 *
 *   ADAPTERS_MODE=live pnpm --filter @repo/worker exec tsx ../../scripts/check-gemini.ts
 *
 * С собственным вопросом:
 *
 *   ADAPTERS_MODE=live pnpm --filter @repo/worker exec tsx ../../scripts/check-gemini.ts "best CRM for startups"
 *
 * Стоит денег — отсюда три предосторожности:
 *   1. Без ADAPTERS_MODE=live скрипт отказывается работать. Случайно потратить
 *      деньги из-за незаданной переменной не должно быть возможно.
 *   2. `maxAttempts: 1` — адаптер по умолчанию повторяет запрос на 5xx, а
 *      «ровно один запрос» здесь важнее, чем пережить временную ошибку.
 *   3. Ключ не печатается никогда: ни в выводе, ни в тексте ошибки, который
 *      приходит от провайдера (`redactKey`).
 *
 * Это не тест: тесты в сеть не ходят. Запускается руками, когда ключ появился.
 */

export const EXIT_OK = 0;
/** Запрос ушёл и не получился. */
export const EXIT_FAILED = 1;
/** Запрос не уходил: не тот режим, нет ключа или непонятные аргументы. */
export const EXIT_REFUSED = 2;

export const DEFAULT_PROMPT = "best project management tool for a small design studio";

const USAGE = [
  "Usage: ADAPTERS_MODE=live tsx scripts/check-gemini.ts [prompt]",
  "",
  "Makes exactly one live Gemini request and prints the model version, cost,",
  "latency, how many sources it cited and which domains those were.",
  "",
  `Default prompt: ${DEFAULT_PROMPT}`,
  "Environment: GEMINI_API_KEY (required), GEMINI_MODEL, GEMINI_ENDPOINT (optional).",
].join("\n");

/**
 * Окружение как простая карта, а не `NodeJS.ProcessEnv`: Next дополняет этот
 * тип обязательным NODE_ENV, и тест не смог бы передать сюда два ключа.
 */
export type CheckEnv = Readonly<Record<string, string | undefined>>;

/** Ответ адаптера нужен только ради `execute` — так его проще подменить в тесте. */
export interface ExecutesPrompt {
  execute(prompt: string): Promise<AdapterResult>;
}

export interface CheckGeminiIo {
  env: CheckEnv;
  /** Аргументы после имени скрипта. */
  args: readonly string[];
  out: (line: string) => void;
  err: (line: string) => void;
  /** Подменяется в тестах; по умолчанию — настоящий GeminiAdapter. */
  createAdapter?: (env: CheckEnv) => ExecutesPrompt;
}

/** Вырезает ключ из любой строки перед печатью. Провайдер может вернуть его в ошибке. */
export function redactKey(text: string, key: string | undefined): string {
  if (!key || key.length < 8) return text;
  return text.split(key).join("[redacted]");
}

/** Хост цитаты. Битый URL не должен ронять проверку — он и есть находка. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return `(unparseable: ${url.slice(0, 40)})`;
  }
}

function defaultAdapter(env: CheckEnv): ExecutesPrompt {
  const model = env["GEMINI_MODEL"]?.trim();
  const endpoint = env["GEMINI_ENDPOINT"]?.trim();

  return new GeminiAdapter({
    apiKey: env["GEMINI_API_KEY"]?.trim() ?? "",
    maxAttempts: 1,
    ...(model ? { model } : {}),
    ...(endpoint ? { endpoint } : {}),
  });
}

function row(label: string, value: string): string {
  return `  ${label.padEnd(12)}${value}`;
}

/**
 * Тело проверки. Возвращает код выхода вместо того, чтобы звать
 * `process.exit`: так его можно прогнать в тесте, не убивая процесс.
 */
export async function runGeminiCheck(io: CheckGeminiIo): Promise<number> {
  const { env, args, out, err } = io;

  if (args.includes("--help") || args.includes("-h")) {
    out(USAGE);
    return EXIT_OK;
  }

  const unknownFlag = args.find((arg) => arg.startsWith("-"));
  if (unknownFlag) {
    err(`Unknown option "${unknownFlag}".`);
    err(USAGE);
    return EXIT_REFUSED;
  }

  if (args.length > 1) {
    err("Too many arguments: pass the prompt as a single quoted string.");
    err(USAGE);
    return EXIT_REFUSED;
  }

  let mode: string;
  try {
    mode = parseAdaptersMode(env["ADAPTERS_MODE"]);
  } catch (error) {
    err(error instanceof Error ? error.message : String(error));
    return EXIT_REFUSED;
  }

  if (mode !== "live") {
    err(
      "This check makes a real, billable Gemini request, so it refuses to run in mock mode. Re-run it with ADAPTERS_MODE=live.",
    );
    return EXIT_REFUSED;
  }

  const key = env["GEMINI_API_KEY"]?.trim();
  if (!key) {
    err(
      "GEMINI_API_KEY is not set. Put it in the worker's .env (it is gitignored) or export it for this command, then run the check again.",
    );
    return EXIT_REFUSED;
  }

  const given = args[0];
  if (given !== undefined && given.trim() === "") {
    err("The prompt is empty. Pass a question, or leave it out to use the default one.");
    return EXIT_REFUSED;
  }
  const prompt = given?.trim() ?? DEFAULT_PROMPT;

  const adapter = (io.createAdapter ?? defaultAdapter)(env);

  let result: AdapterResult;
  try {
    result = await adapter.execute(prompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    err(`The Gemini request failed: ${redactKey(message, key)}`);
    return EXIT_FAILED;
  }

  const domains = [...new Set(result.citations.map((citation) => hostOf(citation.url)))];

  out("Gemini live check — one request, one answer.");
  out(row("prompt", prompt));
  out(row("model", result.modelVersion));
  out(row("expected", env["GEMINI_MODEL"]?.trim() || DEFAULT_GEMINI_MODEL));
  out(row("cost", `$${result.costUsd.toFixed(6)}`));
  out(row("latency", `${result.latencyMs} ms`));
  out(row("citations", String(result.citations.length)));
  out(row("domains", domains.length > 0 ? domains.join(", ") : "none"));
  out(row("answer", `${result.text.slice(0, 160).replace(/\s+/g, " ")}…`));

  if (result.citations.length === 0) {
    out("");
    out(
      "No sources cited. Worth a second look: visibility is measured on answers with search switched on, and an answer written from memory is not one of those.",
    );
  }

  return EXIT_OK;
}

/** Запуск из командной строки. В тестах этот блок не выполняется. */
async function main(): Promise<void> {
  const code = await runGeminiCheck({
    env: process.env,
    args: process.argv.slice(2),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
  process.exit(code);
}

// Сравниваются именно пути, а не строка URL: в пути репозитория есть пробелы,
// и в import.meta.url они закодированы как %20. При импорте из теста argv[1] —
// это vitest, пути не совпадают, и main() не трогается.
const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && resolve(fileURLToPath(import.meta.url)) === entry) {
  void main();
}
