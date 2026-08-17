import { expect, test, type Page } from "@playwright/test";

/**
 * ВРЕМЕННЫЙ прогон ради скриншотов. Удаляется до финального коммита.
 *
 * Тесты не видят дизайн: они проверяют, что элемент есть, а не что он читается.
 * Поэтому визуальные изменения проверяются здесь — реальным браузером на двух
 * ширинах и в обеих темах, с проверкой, что страница не едет вбок.
 */

const CSV = [
  "cluster,intent,prompt,is_control",
  "CRM comparison,comparison,best CRM for startups,false",
  "CRM comparison,comparison,easiest CRM for a small sales team,false",
  "CRM comparison,comparison,HubSpot alternatives,false",
  "CRM basics,learning,what to look for when choosing a CRM,false",
  "CRM basics,learning,CRM vs spreadsheet for a small team,false",
  "CRM basics,learning,how does CRM pipeline management work,false",
].join("\n");

async function overflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test("look", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });

  const email = `look-${Math.random().toString(36).slice(2, 10)}@northwind-agency.test`;
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("Look Tester");
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
  await expect(page).toHaveURL(/\/onboarding$/);
  const clientId = page.url().split("/").slice(-2)[0]!;

  await page.goto(`/clients/${clientId}/measure`);
  await page.getByLabel("Prompts CSV").setInputFiles({
    name: "prompts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV, "utf8"),
  });
  await page.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByTestId("run-status")).toContainText("done", { timeout: 60_000 });

  const shots: [string, string][] = [
    ["dashboard", "/dashboard"],
    ["overview", `/clients/${clientId}`],
    ["opportunities", `/clients/${clientId}/opportunities`],
    ["work", `/clients/${clientId}/actions`],
    ["analytics", `/clients/${clientId}/diagnose`],
  ];

  for (const [name, path] of shots) {
    await page.goto(path);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `shots/${name}.png` });
    expect(await overflow(page), `${name} scrolls sideways`).toBeLessThanOrEqual(1);
  }

  // Развёрнутая возможность — самый плотный экран продукта.
  await page.goto(`/clients/${clientId}/opportunities`);
  await page.getByTestId("opportunity-card").first().getByRole("button").first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "shots/opportunity-detail.png" });

  // Тёмная тема: до сих пор её никто не видел ни разу.
  await page.goto(`/clients/${clientId}/opportunities`);
  await page.getByTestId("theme-toggle").click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "shots/dark-opportunities.png" });
  await page.goto(`/clients/${clientId}`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "shots/dark-overview.png" });
  await page.getByTestId("theme-toggle").click();

  // Телефон.
  await page.setViewportSize({ width: 375, height: 812 });
  for (const [name, path] of shots.slice(0, 3)) {
    await page.goto(path);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `shots/mobile-${name}.png` });
    expect(await overflow(page), `mobile ${name} scrolls sideways`).toBeLessThanOrEqual(1);
  }
});
