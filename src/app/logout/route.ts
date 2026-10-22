import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** Signs out, then sends the browser to /login with a GET (303), not a repeat of this POST. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) console.error(`[logout] sign-out failed: ${error.message}`);
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
