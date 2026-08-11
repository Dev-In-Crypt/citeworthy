import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createDb, getAgencyById } from "@repo/db";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";

/** Общий каркас всех защищённых экранов: сессия проверяется здесь, а не в каждой странице. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login");
  }

  const agencyId = (session.user as { agencyId?: string }).agencyId;
  const { db, close } = createDb();
  let agencyName = "Your agency";
  try {
    if (agencyId) {
      agencyName = (await getAgencyById(db, agencyId))?.name ?? agencyName;
    }
  } finally {
    await close();
  }

  return (
    <AppShell agencyName={agencyName} userEmail={session.user.email}>
      {children}
    </AppShell>
  );
}
