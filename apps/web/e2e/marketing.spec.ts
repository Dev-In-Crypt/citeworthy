import { expect, test } from "@playwright/test";
import { PLAN_LIMITS } from "../../../packages/core/src/billing/period";
import { collectConsoleErrors } from "./console";

/**
 * Витрина: /, /product, /pricing, /free-audit.
 *
 * Страницы публичные, у каждой свой h1 и заголовок вкладки, шапка ведёт куда
 * обещает, цены равны PLAN_LIMITS, карточка отчёта в бренде агентства не
 * несёт ничего нашего, а на 375px страница не уезжает вбок.
 */

const PAGES = [
  { path: "/", h1: /Sell and deliver AI Search retainers/, title: /Citeworthy/ },
  { path: "/product", h1: /From the answers assistants give/, title: /Product · Citeworthy/ },
  { path: "/pricing", h1: /Priced per client account/, title: /Pricing · Citeworthy/ },
  { path: "/free-audit", h1: /Audit one of your own clients/, title: /Free audit · Citeworthy/ },
] as const;

test("every marketing page renders for an anonymous visitor with its own title", async ({ page }) => {
  const errors = collectConsoleErrors(page);

  for (const entry of PAGES) {
    const response = await page.goto(entry.path);
    expect(response?.ok(), `${entry.path} did not load`).toBe(true);
    // Публичная страница не уводит на логин.
    await expect(page).toHaveURL(new RegExp(`${entry.path === "/" ? "/" : entry.path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(entry.h1);
    await expect(page).toHaveTitle(entry.title);
    expect(await page.locator('meta[name="description"]').getAttribute("content")).toBeTruthy();

    const html = await page.content();
    expect(html).not.toMatch(/\bproven\b|\bproof\b|\bguaranteed\b|\bcaused\b/i);
    // Метода «сравнение с базовой линией платформы» в продукте нет — на сайте его тоже нет.
    expect(html.toLowerCase()).not.toContain("platform baseline");
    // Не измеряемые поверхности не выдаются за измеряемые.
    expect(html).not.toMatch(/measures? (Microsoft )?Copilot/i);
  }

  expect(errors).toEqual([]);
});

test("the header takes a visitor to each marketing page", async ({ page }) => {
  await page.goto("/pricing");
  const nav = page.getByRole("navigation", { name: "Main", exact: true });

  const targets = [
    { name: "Product", url: /\/product$/ },
    { name: "Sample report", url: /\/sample-report$/ },
    { name: "Pricing", url: /\/pricing$/ },
    { name: "Free audit", url: /\/free-audit$/ },
  ];
  for (const target of targets) {
    await nav.getByRole("link", { name: target.name, exact: true }).click();
    await expect(page).toHaveURL(target.url);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  }

  // Текущий раздел подсвечен.
  await expect(nav.getByRole("link", { name: "Free audit", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );

  const header = page.getByTestId("marketing-header");
  await expect(header.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  await expect(page.getByTestId("header-cta")).toHaveAttribute("href", "/signup");
  await expect(page.getByTestId("header-cta")).toContainText("Start a free audit");

  await header.getByRole("link", { name: "Citeworthy home" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("the mobile menu works at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  // Полная навигация спрятана, вместо неё — меню.
  await expect(page.getByRole("navigation", { name: "Main", exact: true })).toBeHidden();
  await page.getByTestId("mobile-menu").locator("summary").click();

  const compact = page.getByRole("navigation", { name: "Main, compact" });
  await expect(compact.getByRole("link", { name: "Sign in" })).toBeVisible();
  await compact.getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL(/\/pricing$/);
});

test("pricing figures are the ones the API enforces", async ({ page }) => {
  await page.goto("/pricing");

  const plans = page.getByTestId("pricing-plans");
  await expect(plans.locator("> li")).toHaveCount(3);

  for (const id of ["starter", "growth", "scale"] as const) {
    const limits = PLAN_LIMITS[id];
    await expect(page.getByTestId(`plan-price-${id}`)).toHaveText(
      `$${limits.priceUsd.toLocaleString("en-US")}`,
    );
    await expect(page.getByTestId(`plan-clients-${id}`)).toHaveText(`up to ${limits.clientLimit}`);
    await expect(page.getByTestId(`plan-checks-${id}`)).toHaveText(
      limits.aiCheckAllowance.toLocaleString("en-US"),
    );
  }

  // Allowance объяснён: сколько проверок съедает обычный клиент. Молчание
  // здесь читалось бы как «сколько угодно».
  await expect(page.getByTestId("pricing-checks")).toContainText("950 checks");
  // Утверждённые условия сказаны; неутверждённые — нет.
  const faq = page.getByTestId("pricing-faq");
  await expect(faq).toContainText("no separate price");
  await expect(faq).toContainText("not counted");
  await expect(faq).toContainText("moving to the next plan");
  // Не утверждено: входит ли API в каждый план и считается ли проспект в лимит.
  const text = await page.locator("main").innerText();
  expect(text).not.toMatch(/\bAPI\b/i);
  expect(text).not.toMatch(/\bprospect/i);

  // Тот же источник цен на главной.
  await page.goto("/");
  for (const id of ["starter", "growth", "scale"] as const) {
    await expect(page.getByTestId(`plan-price-${id}`)).toHaveText(
      `$${PLAN_LIMITS[id].priceUsd.toLocaleString("en-US")}`,
    );
  }
});

test("the white-label card switches agency and carries nothing of ours", async ({ page }) => {
  await page.goto("/");

  const card = page.getByTestId("hero-report");
  const agency = page.getByTestId("hero-report-agency");
  await expect(agency).toHaveText("Northwind Studio");
  const before = await card.evaluate((el) => getComputedStyle(el).getPropertyValue("--agency").trim());

  await page.getByRole("button", { name: "Harbor & Pine" }).click();
  await expect(agency).toHaveText("Harbor & Pine");
  await expect(page.getByRole("button", { name: "Harbor & Pine" })).toHaveAttribute("aria-pressed", "true");
  const after = await card.evaluate((el) => getComputedStyle(el).getPropertyValue("--agency").trim());
  expect(after).not.toBe(before);

  // Ни имени продукта, ни нашего индиго внутри карточки.
  for (const path of ["/", "/product", "/free-audit"]) {
    await page.goto(path);
    const cards = page.locator('article[data-testid$="-report"]');
    await expect(cards).toHaveCount(1);
    const inner = await cards.first().evaluate((el) => el.innerHTML.toLowerCase());
    expect(inner).not.toContain("citeworthy");
    expect(inner).not.toContain("#4f39f6");
    expect(inner).not.toContain("79, 57, 246");
  }
});

test("no marketing page scrolls sideways at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  for (const entry of PAGES) {
    await page.goto(entry.path);
    const overflow = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(overflow.scroll, `${entry.path} scrolls sideways`).toBeLessThanOrEqual(overflow.client);
  }
});
