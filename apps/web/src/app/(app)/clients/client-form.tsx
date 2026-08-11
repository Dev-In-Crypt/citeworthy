"use client";

import { useState } from "react";

export interface ClientFormValues {
  name: string;
  domain: string;
  industry: string;
  brandNames: string[];
  competitorNames: string[];
}

/** Списки имён вводятся через запятую — самый предсказуемый ввод для агентства. */
export function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const inputClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ClientForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  initial?: Partial<ClientFormValues>;
  submitLabel: string;
  pending: boolean;
  error?: string | null;
  onSubmit: (values: ClientFormValues) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [domain, setDomain] = useState(initial?.domain ?? "");
  const [industry, setIndustry] = useState(initial?.industry ?? "");
  const [brandNames, setBrandNames] = useState((initial?.brandNames ?? []).join(", "));
  const [competitorNames, setCompetitorNames] = useState(
    (initial?.competitorNames ?? []).join(", "),
  );

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          name: name.trim(),
          domain: domain.trim(),
          industry: industry.trim(),
          brandNames: parseList(brandNames),
          competitorNames: parseList(competitorNames),
        });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Client name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Domain</span>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          required
          placeholder="acmecrm.com"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Industry</span>
        <input
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="B2B SaaS / CRM"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Brand names</span>
        <span className="text-sm text-muted-foreground">
          Every way the brand is written, comma separated. Answers rarely use the exact legal name.
        </span>
        <input
          value={brandNames}
          onChange={(e) => setBrandNames(e.target.value)}
          placeholder="AcmeCRM, Acme CRM, Acme"
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Competitors</span>
        <span className="text-sm text-muted-foreground">
          Tracked alongside the client, so you can show the gap rather than a bare number.
        </span>
        <input
          value={competitorNames}
          onChange={(e) => setCompetitorNames(e.target.value)}
          placeholder="HubSpot, Pipedrive, Close"
          className={inputClass}
        />
      </label>

      {error && (
        <p role="alert" data-testid="form-error" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-10 w-fit rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
