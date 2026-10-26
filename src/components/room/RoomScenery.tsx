/** The line-art room as SVG fragments in a shared 240x200 space, for both recruiters. */

export const SCENE_VIEWBOX = "0 0 240 200";

/** The chalkboard behind the recruiter: green, in a wooden frame, a few lines of chalk. */
export function Whiteboard() {
  return (
    <g strokeWidth={2}>
      <rect x={40} y={14} width={160} height={78} rx={4} className="fill-chalkboard stroke-wood" strokeWidth={5} />
      <path d="M54 34h34M54 42h30M54 50h26" className="fill-none stroke-paper" />
    </g>
  );
}

/** The desk front: a surface panel with the edge line. */
export function Desk() {
  return (
    <>
      <rect x={6} y={176} width={228} height={24} className="fill-surface" />
      <path d="M10 176h220" className="stroke-ink" strokeWidth={2.5} />
    </>
  );
}

/** Thought dots beside the head while the answer is being scored. */
export function ThoughtDots({ visible }: { visible: boolean }) {
  return (
    <g className={`fill-muted transition-opacity ${visible ? "opacity-100 motion-safe:animate-pulse" : "opacity-0"}`}>
      <circle cx={160} cy={58} r={3} />
      <circle cx={168} cy={48} r={2.3} />
      <circle cx={174} cy={40} r={1.7} />
    </g>
  );
}

