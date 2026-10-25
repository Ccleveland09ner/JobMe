/** Setup -> room handoff through sessionStorage; optional, so storage may be unavailable. */

const introKey = (sessionId: string) => `jobme:intro:${sessionId}`;

/** The recruiter's opening: the greeting the candidate answers, then the line said before question 1. */
export interface Opening {
  greeting: string | null;
  line: string;
}

/** Saves the recruiter's opening from the create response. */
export function saveIntro(sessionId: string, opening: Opening): void {
  try {
    sessionStorage.setItem(introKey(sessionId), JSON.stringify(opening));
  } catch {
    // The room opens on the first question instead.
  }
}

/** Reads the opening once, then forgets it so a refresh does not repeat it. */
export function takeIntro(sessionId: string): Opening | null {
  try {
    const raw = sessionStorage.getItem(introKey(sessionId));
    sessionStorage.removeItem(introKey(sessionId));
    return raw ? parseOpening(raw) : null;
  } catch {
    return null;
  }
}

/** A tab left open across the deploy holds the old plain line: said as before, without a greeting. */
export function parseOpening(raw: string): Opening {
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && typeof (value as Opening).line === "string") {
      const { greeting, line } = value as Opening;
      return { greeting: typeof greeting === "string" && greeting.trim() ? greeting : null, line };
    }
  } catch {
    // Not JSON: the old format.
  }
  return { greeting: null, line: raw };
}
