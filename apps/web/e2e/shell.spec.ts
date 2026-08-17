import { expect, test, type ConsoleMessage } from "@playwright/test";

/**
 * Verify T05: все защищённые роуты рендерятся, навигация работает,
 * в консоли нет ошибок. Регистрация в каждом прогоне даёт свежее агентство.
 */

const ROUTES = ["/dashboard", "/clients", "/settings", "/settings/usage"] as const;

test("app shell renders every route without console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const email = `shell-${Math.random().toString(36).slice(2, 10)}@northwind-agency.test`;

  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Shell Tester");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Сайдбар показывает агентство и почту на всех экранах.
  const sidebar = page.locator("aside");
  await expect(sidebar).toContainText("Northwind Agency");
  await expect(sidebar).toContainText(email);

  for (const route of ROUTES) {
    await page.goto(route);
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Активный пункт навигации подсвечен.
    await expect(page.locator(`aside a[href="${route}"][aria-current="page"]`)).toBeVisible();
  }

  // На каждом экране есть empty state или метрика — экранов без содержимого быть не должно.
  await page.goto("/clients");
  await expect(page.getByText("No clients yet")).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("protected routes redirect anonymous visitors to login", async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("the product has an icon and a name on the tab", async ({ page }) => {
  /**
   * До этого у продукта не было ни иконки, ни знака: во вкладке браузера он
   * был безымянным прямоугольником. Проверяется именно доставка файла, а не
   * наличие тега: путь, который Next выводит из соглашения, легко потерять
   * при переносе каталога.
   */
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle(/Citeworthy/);

  const href = await page.locator('link[rel~="icon"]').first().getAttribute("href");
  expect(href, "no favicon is declared").toBeTruthy();

  const icon = await page.request.get(href!);
  expect(icon.ok(), `favicon at ${href} does not load`).toBe(true);
});
