import type { Metadata } from "next";
import { reportPayloadSchema } from "@repo/core";
import { createDb, getAgencyById, getClientById, getReportById, getShareByToken } from "@repo/db";
import { ReportView } from "@/components/report-view";
import { ApproveForm } from "./approve-form";

/**
 * Публичный отчёт по ссылке — единственный анонимный доступ в продукте
 * (инвариант 1). Только чтение плюс подтверждение; аккаунт клиенту не нужен,
 * потому что требовать регистрацию от клиента агентства значит убить канал.
 */

export const metadata: Metadata = {
  // Заголовок вкладки тоже без брендинга продукта (инвариант 3).
  title: "AI Search report",
  /**
   * Описание задаётся явно, чтобы не унаследовать маркетинговую строку из
   * корневого layout: она попадает в исходник страницы, которую агентство
   * отправляет своему клиенту, и это ровно тот брендинг, которого тут быть
   * не должно.
   */
  description: "Client report on visibility in AI answers.",
  robots: { index: false, follow: false },
};

export default async function PublicReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { db, close } = createDb();

  try {
    const share = await getShareByToken(db, token);
    const expired = share?.expiresAt ? share.expiresAt.getTime() < Date.now() : false;

    if (!share || expired) {
      return (
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-3 px-6">
          <h1 className="text-xl font-semibold tracking-tight">This link is no longer valid</h1>
          <p className="text-sm text-muted-foreground">
            It may have expired. Ask for a fresh link.
          </p>
        </main>
      );
    }

    const report = await getReportById(db, share.reportId);
    const client = report ? await getClientById(db, report.clientId) : undefined;
    const agency = client ? await getAgencyById(db, client.agencyId) : undefined;

    if (!report || !client || !agency) {
      return (
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-3 px-6">
          <h1 className="text-xl font-semibold tracking-tight">This report is unavailable</h1>
        </main>
      );
    }

    const payload = reportPayloadSchema.parse(report.payload);

    return (
      <main>
        <ReportView
          payload={payload}
          agency={{
            name: agency.name,
            logoUrl: agency.logoUrl,
            brandColor: agency.brandColor,
          }}
          approved={
            share.approvedAt ? { at: share.approvedAt, byName: share.approvedByName } : null
          }
        />
        {!share.approvedAt && <ApproveForm token={token} />}
      </main>
    );
  } finally {
    await close();
  }
}
