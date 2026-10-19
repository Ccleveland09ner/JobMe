/**
 * Settings, as the notice board on the lobby wall. Server Component.
 * Ref: docs/reverse-engineering/interaction-flow.md > 6. The noteboard
 *
 * Two notes: Interview defaults (stored in this browser) and Account
 * (username and member code, read-only; display name, editable).
 * The profile read is not essential: without it the account note shows what
 * it can, and the defaults note works regardless.
 */

import { AccountNote } from "@/components/settings/AccountNote";
import { DefaultsNote } from "@/components/settings/DefaultsNote";
import { NoticeBoard } from "@/components/settings/NoticeBoard";
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
    <NoticeBoard
      notes={[
        {
          id: "defaults",
          title: "Interview defaults",
          summary: "Quick or Full, and whether you speak or type your answers.",
          content: <DefaultsNote />,
          tint: "paper",
          tilt: -2.5,
        },
        {
          id: "account",
          title: "Account",
          summary: profile?.username ? `@${profile.username} · the name the recruiter uses · sign out` : "Your name, member code, and sign out.",
          content: (
            <AccountNote
              userId={user.id}
              username={profile?.username ?? null}
              memberCode={profile?.member_code ?? null}
              displayName={displayName}
              email={user.email ?? null}
            />
          ),
          tint: "yellow",
          tilt: 2,
        },
      ]}
    />
  );
}
