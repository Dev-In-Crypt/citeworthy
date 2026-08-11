import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createDb, getAgencyById } from "@repo/db";
import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";

export default async function DashboardPage() {
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
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Signed in as {session.user.email}</p>
          <h1 data-testid="agency-name" className="text-2xl font-semibold tracking-tight">
            {agencyName}
          </h1>
        </div>
        <SignOutButton />
      </header>

      {/* Empty state с CTA — обязателен на каждом экране (IMPLEMENTATION_PLAN.md §4.3) */}
      <section className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-8">
        <h2 className="text-base font-medium">No clients yet</h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          Add your first client to start measuring how often AI assistants mention them, and where
          their competitors show up instead.
        </p>
        <span className="text-sm text-muted-foreground">Client management lands in T07.</span>
      </section>
    </main>
  );
}
