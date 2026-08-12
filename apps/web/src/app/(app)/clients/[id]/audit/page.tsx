import { PageHeader } from "@/components/page-header";
import { AuditView } from "./audit-view";

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <>
      <PageHeader
        title="Run audit"
        description="One measurement pass across every platform, then straight to the diagnosis. Nothing is published anywhere — the audit only reads what assistants already answer."
      />
      <AuditView clientId={id} />
    </>
  );
}
