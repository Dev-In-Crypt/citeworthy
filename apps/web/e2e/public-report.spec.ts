import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Verify T51: публичная страница отчёта открывается без логина и несёт
 * ноль брендинга продукта — только агентство (инвариант 3).
 */

const CSV = [
  "cluster,intent,prompt,is_control",
  "CRM comparison,comparison,best CRM for startups,false",
].join("\n");

/**
 * Название продукта не должно встречаться на клиентской странице ни в каком виде.
 * При переименовании продукта этот список обязан обновиться вместе с ним —
 * иначе проверка инварианта 3 продолжит искать строку, которой больше нет.
 */
const PRODUCT_BRANDING = [
  "Citeworthy",
  "citeworthy",
  "northwind-agency.test",
] as const;

async function setUpAgencyWithReport(page: Page): Promise<{ clientId: string; token: string }> {
  const email = `report-${Math.random().toString(36).slice(2, 10)}@northwind-agency.test`;

  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Report Tester");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Брендинг агентства: имя и цвет уйдут в клиентский отчёт.
  await page.goto("/settings");
  await page.getByLabel("Agency name").fill("Northwind Studio");
  await page.getByLabel("Brand colour").fill("#0ea5e9");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("settings-status")).toHaveText("Saved");

  await page.goto("/clients/new");
  await page.getByLabel("Client name").fill("AcmeCRM");
  await page.getByLabel("Domain").fill("acmecrm.test");
  await page.getByLabel("Brand names").fill("AcmeCRM, Acme CRM");
  await page.getByLabel("Competitors").fill("HubSpot, Pipedrive");
  await page.getByRole("button", { name: "Create client" }).click();
  await page.getByRole("link", { name: /AcmeCRM/ }).click();
  await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}$/);
  const clientId = page.url().split("/").pop()!;

  await page.goto(`/clients/${clientId}/measure`);
  await page.getByLabel("Prompts CSV").setInputFiles({
    name: "prompts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV, "utf8"),
  });
  await page.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByTestId("run-status")).toContainText("done", { timeout: 30_000 });

  await page.goto(`/clients/${clientId}/reports`);
  await page.getByTestId("generate-report").click();
  await expect(page.getByTestId("reports-list").locator("li")).toHaveCount(1);

  await page.getByRole("button", { name: "Get client link" }).click();
  const link = page.getByTestId("share-link");
  await expect(link).toBeVisible();
  const token = (await link.innerText()).replace("/r/", "").trim();

  return { clientId, token };
}

test("client report opens without login and carries only the agency brand", async ({
  page,
  browser,
}) => {
  const { token } = await setUpAgencyWithReport(page);

  // Открываем в чистом контексте: у клиента агентства нет ни аккаунта, ни куки.
  const anonymous = await browser.newContext();
  const anonPage = await anonymous.newPage();
  await anonPage.goto(`/r/${token}`);

  // Брендинг агентства присутствует.
  await expect(anonPage.getByTestId("agency-name")).toHaveText("Northwind Studio");

  // Главная проверка инварианта 3: ни следа продукта в разметке страницы.
  const html = await anonPage.content();
  for (const marker of PRODUCT_BRANDING) {
    expect(html).not.toContain(marker);
  }
  await expect(anonPage).toHaveTitle(/AI Search report/);

  // Содержимое отчёта на месте.
  await expect(anonPage.getByTestId("report-visibility")).toContainText("%");
  await expect(anonPage.getByTestId("report-gap")).toContainText("pp");
  await expect(anonPage.getByTestId("report-results")).toContainText("Brand mentions");

  // Оговорки — часть отчёта, а не мелкий шрифт.
  await expect(anonPage.getByTestId("report-caveats")).toContainText("share of AI answers");

  // Никаких обещаний причинности в клиентском документе.
  expect(html).not.toMatch(/\bproven\b|\bproof\b|\bguaranteed\b|\bcaused\b/i);

  await anonymous.close();
});

test("an unknown or expired link says so instead of failing", async ({ browser }) => {
  const anonymous = await browser.newContext();
  const anonPage = await anonymous.newPage();

  await anonPage.goto("/r/definitely-not-a-real-token");
  await expect(anonPage.getByText("This link is no longer valid")).toBeVisible();

  await anonymous.close();
});
