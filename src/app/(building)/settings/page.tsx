/**
 * Settings: what is written on the 3D notice board's notes (interview
 * defaults, account). The profile read is not essential.
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
