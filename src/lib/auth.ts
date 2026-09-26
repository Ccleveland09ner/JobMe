/**
 * Auth guard used by every protected page and route.
 *
 * TODO(slice 1): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Components > Auth and Profile
 *
 * Pages: call getUser(), redirect('/login') when there is no user.
 * Routes: return 401 JSON instead of redirecting.
 *
 * The proxy (src/proxy.ts) only refreshes the session - it does not gate
 * routes, so this has to be called explicitly.
 */

/** Server-side. Redirects to /login when signed out. */
export async function requireUser(): Promise<{ id: string; email?: string }> {
  throw new Error("TODO(slice 1): requireUser not implemented");
}

/** Route-handler variant. Returns null instead of redirecting, so the caller
 *  can respond with a 401 JSON body. */
export async function getUserOrNull(): Promise<{ id: string } | null> {
  throw new Error("TODO(slice 1): getUserOrNull not implemented");
}

export const UNAUTHORIZED = { error: "Unauthorized" } as const;
