import { expect, test } from "@playwright/test";

/**
 * Verify T55: страница usage показывает стоимость измерений за период.
 */

const CSV = [
  "cluster,intent,prompt,is_control",
  "CRM comparison,comparison,best CRM for startups,false",
].join("\n");

test("usage page shows cost from the answers that were measured", async ({ page }) => {
  const email = `usage-${Math.random().toString(36).slice(2, 10)}@northwind-agency.test`;

  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Usage Tester");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Пустое состояние до первых измерений — экранов без содержимого быть не должно.
  await page.goto("/settings/usage");
  await expect(page.getByText("No measurement cost in this period")).toBeVisible();

  await page.goto("/clients/new");
  await page.getByLabel("Client name").fill("AcmeCRM");
  await page.getByLabel("Domain").fill("acmecrm.test");
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

  await page.getByRole("link", { name: "best CRM for startups" }).click();
  const answers = page.getByTestId("responses-list").locator("> li");
  await expect(answers).toHaveCount(9); // 3 платформы × 3 сэмпла
  const answerCount = await answers.count();

  // Прогон шёл на фикстурах: денег он не стоил, и страница расходов не должна
  // выдавать его за трату. Ответы посчитаны отдельной строкой, в счёт не идут.
  await page.goto("/settings/usage");
  await expect(page.getByTestId("usage-fixtures")).toContainText(String(answerCount));
  await expect(page.getByText("No measurement cost in this period")).toBeVisible();
  await expect(page.getByTestId("usage-total")).toHaveCount(0);
});
