"use client";

import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/page-header";
import { ClientForm } from "../client-form";

export default function NewClientPage() {
  const router = useRouter();
  const utils = api.useUtils();

  const create = api.clients.create.useMutation({
    onSuccess: async () => {
      await utils.clients.list.invalidate();
      router.push("/clients");
      router.refresh();
    },
  });

  return (
    <>
      <PageHeader
        title="Add client"
        description="Brand names and competitors drive how answers are parsed, so it is worth listing every spelling."
      />
      <ClientForm
        submitLabel="Create client"
        pending={create.isPending}
        error={create.error?.message ?? null}
        onSubmit={(values) =>
          create.mutate({
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
