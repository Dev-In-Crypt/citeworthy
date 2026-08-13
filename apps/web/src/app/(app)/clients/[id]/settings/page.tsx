"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/page-header";
import { ClientForm } from "../../client-form";

export default function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const utils = api.useUtils();

  const client = api.clients.get.useQuery({ id });

  const update = api.clients.update.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.clients.list.invalidate(), utils.clients.get.invalidate({ id })]);
      router.push("/clients");
      router.refresh();
    },
  });

  const remove = api.clients.delete.useMutation({
    onSuccess: async () => {
      await utils.clients.list.invalidate();
      router.push("/clients");
      router.refresh();
    },
  });

  if (client.isPending) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  // Чужой клиент отдаётся как NOT_FOUND — интерфейс не подтверждает его существование.
  if (client.error || !client.data) {
    return (
      <>
        <PageHeader title="Client not found" description="It may have been removed." />
        <p data-testid="form-error" className="text-sm text-muted-foreground">
          Nothing to show here.
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Name, domain, brand names and competitors — everything measurement matches against."
        action={
          <button
            type="button"
            onClick={() => remove.mutate({ id })}
            disabled={remove.isPending}
            className="h-10 rounded-md border border-input px-4 text-sm font-medium hover:bg-accent disabled:opacity-60"
          >
            Delete
          </button>
        }
      />
      <ClientForm
        initial={{
          name: client.data.name,
          domain: client.data.domain,
          industry: client.data.industry ?? "",
          brandNames: client.data.brandNames,
          competitorNames: client.data.competitorNames,
          isProspect: client.data.status === "prospect",
        }}
        submitLabel="Save changes"
        pending={update.isPending}
        error={update.error?.message ?? null}
        onSubmit={(values) =>
          update.mutate({
            id,
            name: values.name,
            domain: values.domain,
            industry: values.industry || undefined,
            brandNames: values.brandNames,
            competitorNames: values.competitorNames,
            status: values.isProspect ? "prospect" : "active",
          })
        }
      />
    </>
  );
}
