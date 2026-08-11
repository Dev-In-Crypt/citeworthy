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
].map((codes) => String.fromCharCode(...codes));

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const SCANNED_ROOTS = [
  join(REPO_ROOT, "apps", "web", "src"),
  join(REPO_ROOT, "packages", "core", "src"),
];

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx"]);

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

  it.each(BANNED_WORDS)("нигде не встречается слово, обещающее причинность: %s", (word) => {
    const offenders: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf8").toLowerCase();
      if (content.includes(word)) {
        offenders.push(file.replace(REPO_ROOT, "").replace(/\\/g, "/"));
      }
    }

    expect(offenders).toEqual([]);
  });
});
