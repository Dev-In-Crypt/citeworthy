import { storage } from "@/server/storage";

/** Отдаёт файлы из хранилища. Логотипы агентств публичны — они попадают в клиентские отчёты. */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key } = await params;
  const object = await storage.get(key.join("/"));

  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(object.bytes as BodyInit, {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "public, max-age=60",
    },
  });
}
