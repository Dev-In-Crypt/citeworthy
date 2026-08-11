import { headers } from "next/headers";
import { createDb, listClientsByAgency } from "@repo/db";
import { auth } from "@/lib/auth";
import { EmptyState, PageHeader } from "@/components/page-header";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const agencyId = (session?.user as { agencyId?: string } | undefined)?.agencyId;

  const { db, close } = createDb();
  let clientCount = 0;
  try {
    if (agencyId) {
      clientCount = (await listClientsByAgency(db, agencyId)).length;
    }
  } finally {
    await close();
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description="Where your clients stand in AI answers, and what moved since last week."
      />

      {clientCount === 0 ? (
        <EmptyState
          title="No clients yet"
          description="Add your first client to start measuring how often AI assistants mention them, and where competitors show up instead."
        />
      ) : (
        <div
          data-testid="client-count"
          className="metric rounded-lg border p-6 text-sm text-muted-foreground"
        >
          {clientCount} active {clientCount === 1 ? "client" : "clients"}. Visibility metrics land in
          T24.
        </div>
      )}
    </>
  );
}
