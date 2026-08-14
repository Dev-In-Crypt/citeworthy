"use client";

import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { PageHeader } from "@/components/page-header";
import { ClientForm } from "../client-form";
import { OnboardingSteps } from "../[id]/onboarding/steps";

export default function NewClientPage() {
  const router = useRouter();
  const utils = api.useUtils();

  const create = api.clients.create.useMutation({
    onSuccess: async (client) => {
      await utils.clients.list.invalidate();
      // Заведённый клиент без промптов ничего не измеряет, поэтому следующий
      // шаг открывается сразу, а не ищется потом в списке.
      router.push(`/clients/${client.id}/onboarding`);
      router.refresh();
    },
  });

  return (
    <>
      <OnboardingSteps current={1} />
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
