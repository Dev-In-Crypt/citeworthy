import { expect, test } from "@playwright/test";

/**
 * Verify T61: от кнопки «Run audit» до готового diagnose-экрана без ручных шагов.
 */

test("one audit run leads straight to a ready diagnosis", async ({ page }) => {
  const email = `audit-run-${Math.random().toString(36).slice(2, 10)}@northwind-agency.test`;

  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Audit Runner");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/clients/new");
  await page.getByLabel("Client name").fill("AcmeCRM");
  await page.getByLabel("Domain").fill("acmecrm.test");
  await page.getByLabel("Industry").fill("CRM software");
  await page.getByLabel("Brand names").fill("AcmeCRM, Acme");
  await page.getByLabel("Competitors").fill("HubSpot, Pipedrive, Close");
  await page.getByLabel("Prospect (free audit)").check();
  await page.getByRole("button", { name: "Create client" }).click();
  // Заведение клиента ведёт на второй шаг онбординга, а не в список.
  await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}\/onboarding$/);
  await page.goto(page.url().replace(/\/onboarding$/, ""));
  const clientId = page.url().split("/").pop()!;

  // До промптов аудит честно говорит, что мерить нечего.
  await page.getByTestId("audit-link").click();
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/audit$`));
  await expect(page.getByText("No prompts to audit yet")).toBeVisible();

  // Промпты берутся генератором (T60) — руками ничего не вводится.
  await page.getByRole("link", { name: "Generate prompts" }).click();
  await page.getByTestId("generate-prompts").click();
  await expect(page.getByTestId("prompt-draft").locator("li")).toHaveCount(24);
  await page.getByTestId("save-generated").click();
  await expect(page.getByTestId("generate-summary")).toContainText("Saved 24 prompts");

  await page.goto(`/clients/${clientId}/audit`);
  await expect(page.getByTestId("audit-steps").locator("li")).toHaveCount(4);

  await page.getByTestId("run-audit").click();
  await expect(page.getByTestId("audit-done")).toBeVisible({ timeout: 120_000 });

  // Дальше экран сам ведёт к диагностике: ручных шагов между ними нет.
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/diagnose$`), { timeout: 30_000 });

  // Диагностика готова: типы источников проставлены той же цепочкой.
  await expect(page.getByTestId("diagnosis-statement")).toBeVisible();
  const table = page.getByTestId("sources-table");
  await expect(table).toContainText("g2.com");
  await expect(table).toContainText("Review platforms");
  await expect(page.getByTestId("gap-summary")).toContainText(/Client in \d+ of \d+/);

  // И видимость посчитана — обзор клиента показывает число, а не прочерк.
  await page.goto(`/clients/${clientId}`);
  await expect(page.getByTestId("stat-visibility")).toHaveText(/^\d+(\.\d+)?%$/);
});
