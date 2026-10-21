/** Setup -> room handoff through sessionStorage; optional, so storage may be unavailable. */

const introKey = (sessionId: string) => `jobme:intro:${sessionId}`;

/** Saves the recruiter's greeting from the create response. */
export function saveIntro(sessionId: string, line: string): void {
  try {
    sessionStorage.setItem(introKey(sessionId), line);
  } catch {
    // The room opens on the first question instead.
  }
}

/** Reads the greeting once, then forgets it so a refresh does not repeat it. */
export function takeIntro(sessionId: string): string | null {
  try {
    const line = sessionStorage.getItem(introKey(sessionId));
    sessionStorage.removeItem(introKey(sessionId));
    return line;
  } catch {
    return null;
  }
}
