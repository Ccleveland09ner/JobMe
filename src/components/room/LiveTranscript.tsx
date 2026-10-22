/** The answer as it is recognised, so a misheard word can be corrected out loud. */

export function LiveTranscript({ interim, final, bare = false }: { interim: string; final: string; bare?: boolean }) {
  const empty = !interim && !final;
  return (
    <div
      aria-live="polite"
      aria-label="Your answer so far"
      // bare: inside the candidate's speech bubble, which is the frame.
      className={bare ? "text-base leading-relaxed" : "min-h-24 rounded-lg border border-line bg-sunken p-3 text-base leading-relaxed"}
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
