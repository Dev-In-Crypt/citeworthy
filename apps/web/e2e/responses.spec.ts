import { expect, test } from "@playwright/test";

/** Verify T23: подсветка упоминаний в сыром ответе после mock-прогона. */

const CSV = [
  "cluster,intent,prompt,is_control",
  "CRM comparison,comparison,best CRM for startups,false",
].join("\n");

test("raw answers show highlighted client and competitor mentions", async ({ page }) => {
  const email = `resp-${Math.random().toString(36).slice(2, 10)}@northwind-agency.test`;

  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Responses Tester");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/clients/new");
  await page.getByLabel("Client name").fill("AcmeCRM");
  await page.getByLabel("Domain").fill("acmecrm.test");
  await page.getByLabel("Brand names").fill("AcmeCRM, Acme CRM, Acme");
  await page.getByLabel("Competitors").fill("HubSpot, Pipedrive, Close");
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
  await expect(page.getByTestId("import-summary")).toContainText("1 prompts");

  // Пока прогона не было — экран честно говорит, что данных нет.
  await page.getByRole("link", { name: "best CRM for startups" }).click();
  await expect(page).toHaveURL(/\/prompts\/[0-9a-f-]{36}$/);
  await expect(page.getByText("No answers yet")).toBeVisible();

  await page.goto(`/clients/${clientId}/measure`);
  await page.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByTestId("run-status")).toContainText("done", { timeout: 30_000 });

  await page.getByRole("link", { name: "best CRM for startups" }).click();

  const responses = page.getByTestId("responses-list");
  await expect(responses.locator("> li")).toHaveCount(9); // 3 платформы × 3 сэмпла

  // Главная проверка: клиент и конкуренты подсвечены в сыром тексте.
  await expect(page.getByTestId("mention-client").first()).toContainText(/Acme/);
  await expect(page.getByTestId("mention-competitor").first()).toContainText(/HubSpot|Pipedrive/);

  // Ссылки платформы показаны — на них строится диагностика источников.
  await expect(page.getByTestId("response-citations").first()).toContainText("g2.com");

  // Версия модели и стоимость видны у каждого ответа: без версии история
  // измерений несравнима между собой (провайдер меняет модель под тем же именем).
  await expect(responses).toContainText("gpt-4o");
  await expect(responses).toContainText("gemini-2.5-pro");
  await expect(responses.locator("> li").first()).toContainText("$0.");
});
