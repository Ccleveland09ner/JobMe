/**
 * Settings: the notice board on the lobby wall. Server Component.
 * Ref: docs/reverse-engineering/interaction-flow.md > 6. The noteboard
 *
 * The board, its SETTINGS plank and its two notes are the 3D ones in the
 * lobby (building/scene/Objects.tsx); the camera has walked over to face
 * them. This page supplies only what is written on the notes:
 * Interview defaults (stored in this browser) and Account (username and
 * member code, read-only; display name, editable; sign out).
 * The profile read is not essential: without it the account note shows what
 * it can, and the defaults note works regardless.
 */

import { AccountNote } from "@/components/settings/AccountNote";
import { BoardNotes } from "@/components/settings/BoardNotes";
import { DefaultsNote } from "@/components/settings/DefaultsNote";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, username, member_code")
    .eq("id", user.id)
    .maybeSingle();
  const profile = error ? null : (data as { display_name: string | null; username: string | null; member_code: string | null } | null);
  const displayName = profile?.display_name?.trim() || user.email?.split("@")[0] || "";

  return (
    <BoardNotes
      notes={[
        { name: "defaults", title: "Interview defaults", content: <DefaultsNote /> },
        {
          name: "account",
          title: "Account",
          content: (
            <AccountNote
              userId={user.id}
              username={profile?.username ?? null}
              memberCode={profile?.member_code ?? null}
              displayName={displayName}
              email={user.email ?? null}
            />
          ),
        },
      ]}
    />
  );
}
