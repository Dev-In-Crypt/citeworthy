import { EmptyState, PageHeader } from "@/components/page-header";

export default function ClientsPage() {
  return (
    <>
      <PageHeader
        title="Clients"
        description="Every client you manage, with the prompts and competitors you track for them."
      />
      <EmptyState
        title="No clients yet"
        description="Client management — adding a client, brand aliases and competitors — lands in T07."
      />
    </>
  );
}
