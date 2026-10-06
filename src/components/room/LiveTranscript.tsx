/**
 * The answer as it is being recognised.
 * Ref: docs/TechDesign-JobMe-MVP.md > Components > Interview Room
 *
 * Interim results render grey, finals render in ink. Showing this before submit
 * is the mitigation for STT mishearing - the candidate can Re-record.
 *
 * Used by the voice path (TODO(voice): fed by lib/voice/stt.ts).
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
