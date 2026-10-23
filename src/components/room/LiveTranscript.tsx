/**
 * The answer as it is recognised, so a misheard word can be corrected out
 * loud. Inside the candidate's speech bubble, which is its frame.
 */

export function LiveTranscript({ text }: { text: string }) {
  return (
    <div aria-live="polite" aria-label="Your answer so far" className="text-base leading-relaxed">
      {text ? <span className="text-ink">{text}</span> : <span className="text-muted">Your words will appear here as you speak.</span>}
    </div>
  );
}
