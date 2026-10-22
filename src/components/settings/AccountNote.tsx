"use client";

/** The account note: username and member code (read-only), display name, sign out. */

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { SignOutButton } from "@/components/building/SignOutButton";
import { Button } from "@/components/ui/Button";
import { paperField } from "@/components/ui/Clipboard";
import { saveDisplayName } from "@/lib/frontend/profile";
import { LIMITS } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/client";

const term = "text-xs font-semibold uppercase tracking-wider text-muted";

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
    setSaving(true);
    setStatus(null);
    const saved = await saveDisplayName(createClient(), userId, name);
    setSaving(false);
    if (!saved.ok) {
      setStatus({ ok: false, text: saved.message });
      return;
    }
    setStatus({ ok: true, text: "Saved. The recruiter uses it from your next interview." });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className={term}>Username</dt>
          <dd className="truncate text-base font-semibold text-ink">{username ? `@${username}` : "—"}</dd>
        </div>
        <div className="flex flex-col items-start gap-0.5">
          <dt className={term}>Member code</dt>
          <dd className="rounded-md border-2 border-ink/50 bg-sunken px-1.5 font-mono text-xs leading-5 tracking-wider text-ink">
            {memberCode ?? "—"}
          </dd>
        </div>
        {email && (
          <div className="col-span-2 flex min-w-0 flex-col gap-0.5">
            <dt className={term}>Email</dt>
            <dd className="truncate text-ink">{email}</dd>
          </div>
        )}
      </dl>

      <form onSubmit={save} className="flex flex-col gap-1 border-t-2 border-dashed border-ink/20 pt-2.5">
        <label htmlFor={`${id}-name`} className={term}>
          What the recruiter calls you
        </label>
        <div className="flex items-end gap-2">
          <input
            id={`${id}-name`}
            className={`${paperField} min-w-0 flex-1`}
            maxLength={LIMITS.displayName}
            autoComplete="given-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setStatus(null);
            }}
          />
          <Button type="submit" size="sm" disabled={saving || !changed}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        <p role="status" className={`min-h-4 text-xs ${status && !status.ok ? "text-danger" : "text-muted"}`}>
          {status?.text ?? ""}
        </p>
      </form>

      <div className="flex items-center justify-between gap-3 border-t-2 border-dashed border-ink/20 pt-2.5">
        <p className="text-xs text-muted">Done for today?</p>
        <SignOutButton label="Sign out" variant="secondary" />
      </div>
    </div>
  );
}
