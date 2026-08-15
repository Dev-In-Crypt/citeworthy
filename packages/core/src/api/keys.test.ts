import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, parseApiKey, verifyApiKey } from "./keys";

/**
 * Verify T96: в базе только хэш, ключ показывается один раз, отозванный
 * ключ не пускает, а неверный формат отсекается до похода в базу.
 */

describe("generateApiKey", () => {
  it("ключ несёт свой префикс и хэш от самого себя", async () => {
    const key = await generateApiKey();

    expect(key.token.startsWith("cw_live_")).toBe(true);
    expect(key.token).toContain(key.prefix);
    expect(key.hash).toBe(await hashApiKey(key.token));
  });

  it("два ключа не совпадают", async () => {
    const [first, second] = await Promise.all([generateApiKey(), generateApiKey()]);

    expect(first.token).not.toBe(second.token);
    expect(first.prefix).not.toBe(second.prefix);
  });

  it("хэш не содержит самого ключа", async () => {
    const key = await generateApiKey();

    expect(key.hash).not.toContain(key.token);
    expect(key.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("parseApiKey", () => {
  it("свой ключ разбирается на префикс", async () => {
    const key = await generateApiKey();

    expect(parseApiKey(key.token)).toEqual({ prefix: key.prefix });
  });

  it("чужие форматы отвергаются без запроса в базу", () => {
    for (const token of ["", "nonsense", "cw_test_abc_def", "cw_live_short_secret", "Bearer x"]) {
      expect(parseApiKey(token)).toBeNull();
    }
  });
});

describe("verifyApiKey", () => {
  it("свой ключ проходит", async () => {
    const key = await generateApiKey();

    await expect(verifyApiKey(key.token, { hash: key.hash, revokedAt: null })).resolves.toBe(true);
  });

  it("чужой ключ с тем же префиксом не проходит", async () => {
    const key = await generateApiKey();
    const other = await generateApiKey();

    await expect(verifyApiKey(other.token, { hash: key.hash, revokedAt: null })).resolves.toBe(
      false,
    );
  });

  it("отозванный ключ не пускает, даже если совпал", async () => {
    const key = await generateApiKey();

    await expect(
      verifyApiKey(key.token, { hash: key.hash, revokedAt: new Date() }),
    ).resolves.toBe(false);
  });
});
