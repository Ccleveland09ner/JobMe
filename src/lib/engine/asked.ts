/** Question text compared the way repeat checks need: case, punctuation and spacing ignored. */
export function normaliseQuestion(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/** True when `text` was already asked in this session, give or take punctuation. */
export function alreadyAsked(text: string, asked: string[]): boolean {
  const wanted = normaliseQuestion(text);
  return asked.some((q) => normaliseQuestion(q) === wanted);
}
