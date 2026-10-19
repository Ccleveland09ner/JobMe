"use client";

/**
 * "Account": who the user is here. Username and member code are read-only
 * (the database refuses changes to them); the display name — what the
 * recruiter calls you — can be edited, through the profiles row the user is
 * allowed to update. Sign out walks out through the front door.
 */

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { SignOutButton } from "@/components/building/FixtureBar";
import { Button } from "@/components/ui/Button";
import { paperField } from "@/components/ui/Clipboard";
import { LIMITS } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/client";

export function AccountNote({
  userId,
  username,
  memberCode,
  displayName,
  email,
}: {
  userId: string;
  username: string | null;
  memberCode: string | null;
  displayName: string;
  email: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = name.trim() !== displayName.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const next = name.trim();
    if (!next) {
      setStatus({ ok: false, text: "Your name can't be empty." });
      return;
    }
    setSaving(true);
    setStatus(null);
    const { error } = await createClient().from("profiles").update({ display_name: next }).eq("id", userId);
    setSaving(false);
    if (error) {
      setStatus({ ok: false, text: "We couldn't save that. Try again in a moment." });
      return;
    }
    setStatus({ ok: true, text: "Saved. The recruiter will use this name from your next interview." });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Username</dt>
          <dd className="text-lg text-ink">{username ? `@${username}` : "—"}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Member code</dt>
          <dd>
            <span className="rounded-md border-2 border-ink/50 bg-sunken px-2 py-0.5 font-mono text-sm tracking-wider text-ink">
              {memberCode ?? "—"}
            </span>
          </dd>
        </div>
        {email && (
          <div className="flex flex-col gap-1 sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted">Email</dt>
            <dd className="text-ink">{email}</dd>
          </div>
        )}
      </dl>

      <form onSubmit={save} className="flex flex-col gap-2 border-t-2 border-dashed border-ink/20 pt-5">
        <label htmlFor={`${id}-name`} className="text-sm font-medium text-ink">
          What should the recruiter call you?
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <input
            id={`${id}-name`}
            className={`${paperField} min-w-48 flex-1`}
            maxLength={LIMITS.displayName}
            autoComplete="given-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setStatus(null);
            }}
          />
          <Button type="submit" size="sm" disabled={saving || !changed}>
            {saving ? "Saving…" : "Save name"}
          </Button>
        </div>
        <p role="status" className={`text-sm ${status && !status.ok ? "text-danger" : "text-muted"}`}>
          {status?.text ?? ""}
        </p>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-dashed border-ink/20 pt-5">
        <p className="text-sm text-muted">Done for today?</p>
        <SignOutButton label="Sign out" variant="secondary" />
      </div>
    </div>
  );
}
