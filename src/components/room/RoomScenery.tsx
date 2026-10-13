/**
 * The line-art interview room, as SVG fragments in a shared 240x200
 * coordinate space (design/mock Inteview session.png).
 *
 * Shared by the SVG recruiter (Avatar.tsx) and the 3D recruiter stage
 * (RecruiterStage.tsx), so both versions sit in the same room: the
 * whiteboard behind the recruiter, the desk and mic in front. In the 3D
 * stage the desk also hides the lap and hands, so only the bust is ever
 * on screen.
 */

export const SCENE_VIEWBOX = "0 0 240 200";

/** Whiteboard behind the recruiter, as in the reference room. */
export function Whiteboard() {
  return (
    <g className="stroke-ink" strokeWidth={2}>
      <rect x={40} y={14} width={160} height={78} rx={4} className="fill-surface" />
      <g className="fill-none">
        <circle cx={47} cy={21} r={2.4} />
        <circle cx={193} cy={21} r={2.4} />
        <circle cx={47} cy={85} r={2.4} />
        <circle cx={193} cy={85} r={2.4} />
        <path d="M54 34h34M54 42h30M54 50h26" />
      </g>
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

/** The desk mic: ink normally, teal with rays while the candidate records. */
export function DeskMic({ listening }: { listening: boolean }) {
  return (
    <g className={listening ? "stroke-accent" : "stroke-ink"} strokeWidth={2}>
      <ellipse cx={120} cy={196} rx={14} ry={3.5} className={listening ? "fill-accent" : "fill-ink"} />
      <circle cx={120} cy={185} r={9} className="fill-surface" />
      <rect
        x={117.5}
        y={179}
        width={5}
        height={8}
        rx={2.5}
        className={listening ? "fill-accent" : "fill-ink"}
        strokeWidth={0}
      />
      <path d="M115 185q0 5 5 5t5-5M120 190v3" className="fill-none" strokeWidth={1.5} />
      <path
        d="M104 180l-5-3M136 180l5-3M103 188h-6M137 188h6"
        className={`fill-none transition-opacity ${listening ? "opacity-100" : "opacity-0"}`}
      />
    </g>
  );
}
