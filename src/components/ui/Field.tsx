/** What every form field shares: the line naming its problem, and what describes it. */

/** A field's problem, under it; the sheet announces them together. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm font-medium text-danger">
      {message}
    </p>
  );
}

/** An `aria-describedby` from the ids that apply; none when nothing does. */
export function describedBy(...ids: (string | false | null | undefined)[]): string | undefined {
  return ids.filter(Boolean).join(" ") || undefined;
}
