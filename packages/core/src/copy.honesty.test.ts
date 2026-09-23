import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Verify T46 и инвариант 2 из CLAUDE.md.
 *
 * Продукт не имеет права заявлять доказанную причинность: измерить её на одном
 * клиенте невозможно, а обещание, которое нельзя сдержать, стоит агентству
 * отношений с его собственным клиентом. Запрет держится не соглашением,
 * а этим тестом — он читает исходники и падает на любом вхождении.
 *
 * Слова собираются из кодов символов, чтобы сам тест не был своим нарушением.
 */

const BANNED_WORDS = [
  [112, 114, 111, 111, 102], // p-r-o-o-f
  [112, 114, 111, 118, 101, 110], // p-r-o-v-e-n
  [103, 117, 97, 114, 97, 110, 116, 101, 101], // g-u-a-r-a-n-t-e-e
  [99, 97, 117, 115, 101, 100], // c-a-u-s-e-d
  // Русские формулировки из инварианта 2: они встречаются в комментариях и в
  // строках, которые однажды попадут на экран, и запрещены ровно так же.
  [1087, 1088, 1080, 1095, 1080, 1085, 1085, 1086], // причинно
  [1075, 1072, 1088, 1072, 1085, 1090, 1080, 1088, 1091, 1077, 1084], // гарантируем
].map((codes) => String.fromCharCode(...codes));

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Сканируется весь код продукта, а не два пакета.
 *
 * Раньше воркер, пайплайн и слой данных оставались вне проверки: формулировка,
 * попавшая оттуда в отчёт или в письмо, прошла бы молча. Инвариант не знает
 * границ пакетов.
 */
const SCANNED_ROOTS = [
  join(REPO_ROOT, "apps", "web", "src"),
  join(REPO_ROOT, "apps", "worker", "src"),
  join(REPO_ROOT, "packages", "core", "src"),
  join(REPO_ROOT, "packages", "db", "src"),
  join(REPO_ROOT, "packages", "pipeline", "src"),
];

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx"]);

/**
 * Комментарии из проверки исключаются.
 *
 * Запрет касается того, что видит человек, а не того, что написано для
 * разработчика: половина комментариев в этом коде объясняет сам запрет
 * («это НЕ доказательство причинности»), и дословная проверка ловила бы
 * объяснение как нарушение. Протокол в ссылке не считается комментарием.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

function collectSourceFiles(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectSourceFiles(full));
      continue;
    }

    // Тесты исключены: они обязаны упоминать запрещённые слова, чтобы их ловить.
    if (entry.includes(".test.")) continue;
    if (SCANNED_EXTENSIONS.has(extname(entry))) {
      found.push(full);
    }
  }

  return found;
}

describe("честность формулировок", () => {
  const files = SCANNED_ROOTS.flatMap(collectSourceFiles);

  it("сканируется непустой набор исходников", () => {
    // Иначе тест был бы зелёным просто потому, что ничего не проверил.
    expect(files.length).toBeGreaterThan(30);
  });

  it("проверяются все пакеты продукта, а не только два", () => {
    // Формулировка из воркера или пайплайна доезжает до отчёта так же, как
    // из веба: граница пакета инварианту не известна.
    for (const part of ["apps/worker", "packages/db", "packages/pipeline"]) {
      expect(files.some((file) => file.split("\\").join("/").includes(part))).toBe(true);
    }
  });

  it("комментарии не считаются нарушением, а строки — считаются", () => {
    const banned = BANNED_WORDS[0]!;
    expect(stripComments(`// ${banned}`)).not.toContain(banned);
    expect(stripComments(`/* ${banned} */`)).not.toContain(banned);
    // Ссылка внутри строки не обрывается: иначе текст после неё выпал бы
    // из проверки целиком.
    expect(stripComments(`const a = "https://x.test ${banned}";`)).toContain(banned);
  });

  it.each(BANNED_WORDS)("нигде не встречается слово, обещающее причинность: %s", (word) => {
    const offenders: string[] = [];

    for (const file of files) {
      const content = stripComments(readFileSync(file, "utf8")).toLowerCase();
      if (content.includes(word)) {
        offenders.push(file.replace(REPO_ROOT, "").replace(/\\/g, "/"));
      }
    }

    expect(offenders).toEqual([]);
  });
});
