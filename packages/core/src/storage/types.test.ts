import { describe, expect, it } from "vitest";
import { logoKey, MAX_LOGO_BYTES, validateLogoUpload } from "./types";

describe("validateLogoUpload", () => {
  const cases: [string, number, boolean][] = [
    ["image/png", 1024, true],
    ["image/jpeg", 1024, true],
    ["image/svg+xml", 1024, true],
    ["image/webp", 1024, true],
    ["application/pdf", 1024, false],
    ["text/html", 1024, false],
    ["image/png", 0, false],
    ["image/png", MAX_LOGO_BYTES, true],
    ["image/png", MAX_LOGO_BYTES + 1, false],
  ];

  it.each(cases)("%s размером %i байт -> ok=%s", (contentType, size, expected) => {
    expect(validateLogoUpload(contentType, size).ok).toBe(expected);
  });

  it("отклонённая загрузка объясняет причину", () => {
    expect(validateLogoUpload("application/pdf", 10).error).toBeTruthy();
  });
});

describe("logoKey", () => {
  it("изолирует файлы по агентству", () => {
    expect(logoKey("agency-1", "png")).toBe("agencies/agency-1/logo.png");
    expect(logoKey("agency-2", "png")).not.toBe(logoKey("agency-1", "png"));
  });
});
