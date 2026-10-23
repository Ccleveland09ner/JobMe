import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

/**
 * Skips api/ (route handlers authenticate themselves, lib/auth.ts) and static
 * files: a session refresh costs a Supabase round trip on every request.
 */
export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|glb|gltf|json|mp3|wav|ogg|woff2?|ttf)$).*)",
  ],
};
