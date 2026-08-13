import { expect, test } from "@playwright/test";

/**
 * Verify T70: лендинг показывает оффер, тарифы и живой пример отчёта,
 * а залогиненного не задерживает.
 */

test("landing gives an anonymous visitor the offer, the plans and a way in", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Главный призыв ведёт к бесплатному аудиту, то есть на регистрацию.
  await expect(page.getByTestId("landing-cta-audit")).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("link", { name: "See an example report" })).toHaveAttribute(
    "href",
    "/sample-report",
  );

  // Три тарифа с суммами из PLAN_LIMITS — витрина и API берут их из одного места.
  await expect(page.getByTestId("pricing-plans").locator("> li")).toHaveCount(3);
  await expect(page.getByTestId("plan-price-starter")).toHaveText("$499");
  await expect(page.getByTestId("plan-price-growth")).toHaveText("$1,299");
  await expect(page.getByTestId("plan-price-scale")).toHaveText("$2,499");

  // Пределы названы вслух, а не спрятаны в подвал.
  await expect(page.getByTestId("landing-limits")).toContainText("ninety days");

  // Allowance объяснён: сколько проверок съедает обычный клиент. Молчание
  // здесь читалось бы как «сколько угодно».
  await expect(page.getByTestId("pricing-checks")).toContainText("950 checks");
  await expect(page.getByText("4,000")).toBeVisible();

  // Цифры витрины взяты из демонстрационного отчёта.
  await expect(page.getByTestId("landing-report-figures")).toContainText("19.4% → 28.6%");
  await expect(page.getByTestId("visibility-gap")).toContainText("11.5%");

  const html = await page.content();
  expect(html).not.toMatch(/\bproven\b|\bproof\b|\bguaranteed\b|\bcaused\b/i);

  expect(consoleErrors).toEqual([]);
});

test("the example report is a real report page in a fictional agency's brand", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "See an example report" }).click();
  await expect(page).toHaveURL(/\/sample-report$/);

  // Образец подписан как выдуманный: иначе это фальшивый кейс.
  await expect(page.getByTestId("sample-report-notice")).toBeVisible();

  // Рендерится тот же компонент, что и клиентский отчёт.
  await expect(page.getByTestId("agency-name")).toHaveText("Harbourline");
  await expect(page.getByTestId("report-visibility")).toContainText("19.4% → 28.6%");
  await expect(page.getByTestId("report-work").locator("li")).toHaveCount(5);
  await expect(page.getByTestId("report-results")).toContainText("Brand mentions");
  await expect(page.getByTestId("report-caveats")).toContainText("share of AI answers");

  const html = await page.content();
  expect(html).not.toMatch(/\bproven\b|\bproof\b|\bguaranteed\b|\bcaused\b/i);
});

test("the audit example shows the ranked work without the agency's internal economics", async ({
  page,
}) => {
  await page.goto("/sample-report/audit");

  await expect(page.getByTestId("report-opportunity")).toBeVisible();
  await expect(page.getByTestId("opportunity-actions").locator("li")).toHaveCount(6);
  await expect(page.getByTestId("opportunity-visibility")).toContainText("11.5%");
  await expect(page.getByTestId("opportunity-retainer")).toContainText("$3,500");

  // Маржа агентства не должна утечь даже на витрину.
  const visible = await page.locator("body").innerText();
  expect(visible.toLowerCase()).not.toContain("margin");
  expect(await page.content()).not.toContain("estimatedMarginPct");
});

test("a signed-in user is not shown the landing", async ({ page }) => {
  const email = `landing-${Math.random().toString(36).slice(2, 10)}@northwind-agency.test`;

  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Landing Tester");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
});
