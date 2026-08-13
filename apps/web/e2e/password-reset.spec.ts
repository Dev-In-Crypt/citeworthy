import { expect, test } from "@playwright/test";

/**
 * Verify T85: со страницы входа есть путь к восстановлению доступа, а
 * просроченная ссылка ведёт себя как просроченная ссылка, а не как поломка.
 */

test("a forgotten password has a way back from the sign-in screen", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);

  await page.getByLabel("Work email").fill("someone@northwind-agency.test");
  await page.getByRole("button", { name: "Send reset link" }).click();

  // Ответ одинаков для существующего и несуществующего адреса: экран входа
  // не должен работать справочником «есть ли такой аккаунт».
  await expect(page.getByTestId("reset-requested")).toBeVisible();
});

test("an expired reset link asks for a new one instead of failing", async ({ page }) => {
  await page.goto("/reset-password?error=INVALID_TOKEN");

  await expect(page.getByText("This link is no longer valid")).toBeVisible();
  await page.getByRole("link", { name: "Request a new link" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

test("a valid reset link shows the form", async ({ page }) => {
  await page.goto("/reset-password?token=whatever");

  await expect(page.getByLabel("New password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save new password" })).toBeVisible();
});
