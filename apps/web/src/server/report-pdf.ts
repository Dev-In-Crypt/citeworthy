import { chromium } from "playwright";
import { storage } from "@/server/storage";

/**
 * PDF печатается из той же публичной страницы, что видит клиент.
 *
 * Отдельный шаблон для печати означал бы два документа, которые со временем
 * разойдутся: клиент прочитает одно, а в PDF уйдёт другое. Один источник —
 * одна правда, ценой запуска браузера.
 */

export function reportPdfKey(reportId: string): string {
  return `reports/${reportId}.pdf`;
}

export interface PdfOptions {
  /** Полный URL публичной страницы отчёта. */
  url: string;
  timeoutMs?: number;
}

export async function renderReportPdf(options: PdfOptions): Promise<Uint8Array> {
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage();
    await page.goto(options.url, {
      waitUntil: "networkidle",
      timeout: options.timeoutMs ?? 30_000,
    });

    // Форма подтверждения в печати не нужна: на бумаге кнопка бессмысленна.
    await page.addStyleTag({
      content: `[data-testid="approve-form"] { display: none !important; }`,
    });

    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "12mm", right: "12mm" },
    });
  } finally {
    await browser.close();
  }
}

/** Рендерит и кладёт в хранилище, возвращая ключ. */
export async function storeReportPdf(reportId: string, url: string): Promise<string> {
  const bytes = await renderReportPdf({ url });
  const key = reportPdfKey(reportId);
  await storage.put(key, bytes, "application/pdf");
  return key;
}
