import { headers } from "next/headers";
import { createDb, getAgencyById } from "@repo/db";
import { auth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const agencyId = (session?.user as { agencyId?: string } | undefined)?.agencyId;

  const { db, close } = createDb();
  try {
    const agency = agencyId ? await getAgencyById(db, agencyId) : undefined;

    return (
      <>
        <PageHeader
          title="Settings"
          description="Agency profile, white-label branding and team. Reports carry your brand, never ours."
        />
        <SettingsForm
          initialName={agency?.name ?? ""}
          initialColor={agency?.brandColor ?? "#4f46e5"}
          initialLogoUrl={agency?.logoUrl ?? null}
        />
      </>
    );
  } finally {
    await close();
  }
}
