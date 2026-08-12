import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import {
  createDb,
  createReportShare,
  getClientById,
  getReportById,
  getShareForReport,
  setReportPdfKey,
} from "@repo/db";
import { auth } from "@/lib/auth";
import { storeReportPdf } from "@/server/report-pdf";
import { storage } from "@/server/storage";

/** Печать отчёта в PDF. Доступна только агентству-владельцу. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const agencyId = (session?.user as { agencyId?: string } | undefined)?.agencyId;

  if (!agencyId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { db, close } = createDb();

  try {
    const report = await getReportById(db, id);
    const client = report ? await getClientById(db, report.clientId) : undefined;

    // Чужой отчёт неотличим от несуществующего (инвариант 1).
    if (!report || !client || client.agencyId !== agencyId) {
      return new Response("Not found", { status: 404 });
    }

    // PDF печатается с публичной страницы, поэтому ссылка нужна даже если
    // агентство её ещё не выдавало клиенту.
    let share = await getShareForReport(db, report.id);
    if (!share) {
      share = await createReportShare(db, {
        reportId: report.id,
        token: randomBytes(32).toString("base64url"),
      });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
    const key = await storeReportPdf(report.id, `${origin}/r/${share.token}`);
    await setReportPdfKey(db, report.id, key);

    const stored = await storage.get(key);
    if (!stored) {
      return new Response("Failed to render", { status: 500 });
    }

    return new Response(stored.bytes as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="report-${report.id}.pdf"`,
      },
    });
  } finally {
    await close();
  }
}
