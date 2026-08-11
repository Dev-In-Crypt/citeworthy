import { EmptyState, PageHeader } from "@/components/page-header";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Agency profile, white-label branding, team and billing."
      />
      <EmptyState
        title="Branding and team"
        description="Logo upload, brand colour and team invites land in T06. Reports use these to stay fully white-label."
      />
    </>
  );
}
