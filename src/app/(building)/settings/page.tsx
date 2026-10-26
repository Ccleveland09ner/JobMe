/**
 * Settings: what is written on the 3D notice board's notes (preferences and
 * account). The profile read is not essential.
 */

import { AccountNote } from "@/components/settings/AccountNote";
import { BoardNotes } from "@/components/settings/BoardNotes";
import { DefaultsNote } from "@/components/settings/DefaultsNote";
import { requireUser } from "@/lib/auth";
import { loadProfile } from "@/lib/frontend/profile";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await loadProfile(await createClient(), user);

  return (
    <BoardNotes
      notes={[
        { name: "defaults", title: "Preferences", content: <DefaultsNote /> },
        {
          name: "account",
          title: "Account",
          content: (
            <AccountNote
              userId={user.id}
              username={profile.username}
              memberCode={profile.memberCode}
              displayName={profile.displayName}
              email={user.email ?? null}
            />
          ),
        },
      ]}
    />
  );
}
