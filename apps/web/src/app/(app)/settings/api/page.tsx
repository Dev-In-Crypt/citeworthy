import { PageHeader } from "@/components/page-header";
import { ApiKeysView } from "./api-keys-view";

export default function ApiPage() {
  return (
    <>
      <PageHeader
        title="API"
        description="Read-only access to your own numbers, for your dashboard or your weekly deck. Nothing here can change data or start a measurement."
      />
      <ApiKeysView />
    </>
  );
}
