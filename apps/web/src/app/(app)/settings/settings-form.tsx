"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/trpc/react";

export function SettingsForm({
  initialName,
  initialColor,
  initialLogoUrl,
}: {
  initialName: string;
  initialColor: string;
  initialLogoUrl: string | null;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initialName);
  const [brandColor, setBrandColor] = useState(initialColor);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = api.agency.update.useMutation({
    onSuccess: () => {
      setStatus("Saved");
      setError(null);
      router.refresh();
    },
    onError: (e) => setError(e.message),
  });

  async function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    const body = new FormData();
    body.append("file", file);

    const response = await fetch("/api/upload/logo", { method: "POST", body });
    const payload = (await response.json()) as { url?: string; error?: string };

    if (!response.ok || !payload.url) {
      setError(payload.error ?? "Upload failed");
      return;
    }

    setLogoUrl(`${payload.url}?v=${Date.now()}`);
    setStatus("Logo updated");
    router.refresh();
  }

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="text-base font-medium">Agency profile</h2>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Agency name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Brand colour</span>
          <p className="text-sm text-muted-foreground">
            Used on client-facing reports instead of any product branding.
          </p>
          <div className="flex items-center gap-3">
            <input
              aria-label="Brand colour"
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              className="h-10 w-16 cursor-pointer rounded-md border border-input bg-background"
            />
            <code data-testid="brand-color-value" className="text-sm text-muted-foreground">
              {brandColor}
            </code>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Logo</span>
          {logoUrl ? (
            // Обычный img, а не next/image: файл пользовательский и отдаётся своим хранилищем.
            <img
              data-testid="agency-logo"
              src={logoUrl}
              alt="Agency logo"
              className="h-12 w-auto rounded border bg-background object-contain p-1"
            />
          ) : (
            <p className="text-sm text-muted-foreground">No logo uploaded yet.</p>
          )}
          <input
            ref={fileInput}
            type="file"
            aria-label="Logo file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={handleLogoChange}
            className="text-sm"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => update.mutate({ name, brandColor })}
            disabled={update.isPending}
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </button>
          {status && (
            <span data-testid="settings-status" className="text-sm text-muted-foreground">
              {status}
            </span>
          )}
        </div>

        {error && (
          <p role="alert" data-testid="form-error" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </section>

      <TeamSection />
    </div>
  );
}

function TeamSection() {
  const members = api.agency.members.useQuery();
  const invites = api.agency.invites.useQuery();
  const [email, setEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const invite = api.agency.invite.useMutation({
    onSuccess: (data) => {
      setInviteLink(`/invite/${data.token}`);
      setEmail("");
      void invites.refetch();
    },
  });

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-medium">Team</h2>

      <ul className="flex flex-col gap-1 text-sm">
        {members.data?.map((member) => (
          <li key={member.id} className="flex justify-between rounded-md border px-3 py-2">
            <span>{member.email}</span>
            <span className="text-muted-foreground">{member.role}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">Invite a teammate</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@agency.com"
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => invite.mutate({ email, role: "member" })}
          disabled={!email || invite.isPending}
          className="h-10 rounded-md border border-input px-4 text-sm font-medium disabled:opacity-60"
        >
          Send invite
        </button>
      </div>

      {inviteLink && (
        <p data-testid="invite-link" className="text-sm text-muted-foreground">
          Share this link: <code>{inviteLink}</code>
        </p>
      )}

      {invites.data && invites.data.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {invites.data.length} pending invitation{invites.data.length === 1 ? "" : "s"}.
        </p>
      )}
    </section>
  );
}
