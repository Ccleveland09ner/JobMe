/**
 * The answer as it is being recognised.
 * Ref: docs/TechDesign-JobMe-MVP.md > Components > Interview Room
 *
 * Shown while recording, so a misheard word is visible as it happens and can
 * be corrected out loud — there is no review step after Send. Interim words
 * may render grey and confirmed words in ink; the room currently passes the
 * combined text as `final`.
 */

export function LiveTranscript({ interim, final }: { interim: string; final: string }) {
  const empty = !interim && !final;
  return (
    <div
      aria-live="polite"
      aria-label="Your answer so far"
      className="min-h-24 rounded-lg border border-line bg-sunken p-3 text-base leading-relaxed"
    >
      {empty ? (
        <span className="text-muted">Your words will appear here as you speak.</span>
      ) : (
        <>
          <span className="text-ink">{final}</span>
          {interim && <span className="text-muted"> {interim}</span>}
        </>
      )}
    </div>
  );
}
