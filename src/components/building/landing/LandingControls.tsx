"use client";

/**
 * The landing page's controls over the scene. Hidden buttons for the keyboard
 * and screen readers (Step inside, and each poster) light their 3D twin when
 * focused, and show as plain buttons without 3D. The 3D tile and posters run
 * the same named actions. An open poster's writing is real text pinned onto
 * its board (ScreenAnchor), with Close, the arrow to the other poster, and
 * "1 of 2"; clicking anywhere else closes it.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { buttonClasses } from "@/components/ui/Button";

import { useBuilding, useShow3D } from "../BuildingProvider";
import { StepInside } from "../StepInside";
import { POSTER_CONTROLS, POSTER_COPY, STEP_INSIDE, type Poster } from "./copy";
import { LANDING_ACTIONS, POSTER_ORDER } from "./layout";
import { usePosterNavigation, type PosterNavigation } from "./usePosterNavigation";

/** Width the writing is laid out at (CSS px), before scaling onto the board. */
const WRITING_WIDTH = 360;
/** No bigger than this on a large screen: centred on the board instead. */
const MAX_SCALE = 1.35;

/**
 * With 3D the twins sit in a click-through bar along the bottom, invisible but
 * there for screen readers and the keyboard; each shows while it has keyboard
 * focus. (Not sr-only, whose reset fights the button's padding; and the
 * button's .grain owns its position, so the bar places them.)
 */
const TWIN_BAR = "pointer-events-none fixed inset-x-0 bottom-6 z-30 flex flex-wrap justify-center gap-3 px-4";
const TWIN_3D = "opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100";

export function LandingControls() {
  const building = useBuilding();
  const show3D = useShow3D();
  const router = useRouter();
  const nav = usePosterNavigation();
  const { openPoster } = nav;
  const setAction = building?.setAction;
  const walkTo = building?.walkTo;
  const setHovered = building?.setHovered;

  useEffect(() => {
    if (!setAction) return;
    setAction(LANDING_ACTIONS.stepInside, () => {
      walkTo?.("entrance");
      router.push("/login");
    });
    for (const poster of POSTER_ORDER) setAction(LANDING_ACTIONS.poster(poster), () => openPoster(poster));
    return () => {
      setAction(LANDING_ACTIONS.stepInside, null);
      for (const poster of POSTER_ORDER) setAction(LANDING_ACTIONS.poster(poster), null);
    };
  }, [setAction, walkTo, router, openPoster]);

  const plain = show3D === false;
  const point = (name: string | null) => setHovered?.(name);

  return (
    <>
      <nav
        aria-label="Outside the building"
        inert={nav.open !== null}
        className={plain ? "pointer-events-auto mt-auto flex flex-wrap justify-center gap-3 px-4 pb-10" : TWIN_BAR}
      >
        <StepInside
          className={plain ? buttonClasses({ size: "lg" }) : `${TWIN_3D} ${buttonClasses({ size: "lg" })}`}
          onFocus={() => point(LANDING_ACTIONS.stepInside)}
          onBlur={() => point(null)}
        >
          {STEP_INSIDE}
        </StepInside>
        {POSTER_ORDER.map((poster) => (
          <button
            key={poster}
            type="button"
            onClick={() => openPoster(poster)}
            onFocus={() => point(LANDING_ACTIONS.poster(poster))}
            onBlur={() => point(null)}
            className={
              plain ? buttonClasses({ variant: "secondary", size: "lg" }) : `${TWIN_3D} ${buttonClasses({ variant: "secondary", size: "lg" })}`
            }
          >
            {plain ? POSTER_COPY[poster].title : POSTER_COPY[poster].open}
          </button>
        ))}
      </nav>

      {nav.open !== null && (
        // Anywhere but the poster: close it. The scene behind takes no clicks meanwhile.
        <div aria-hidden="true" onClick={nav.close} className="pointer-events-auto fixed inset-0 z-20" />
      )}
      <div aria-live="polite" className="pointer-events-none fixed inset-0 z-30">
        {POSTER_ORDER.map((poster) =>
          plain ? (
            nav.open === poster && (
              <div key={poster} className="pointer-events-auto absolute inset-0 m-auto h-fit w-[min(24rem,calc(100vw-2rem))]">
                <PosterCard poster={poster} nav={nav} shown />
              </div>
            )
          ) : (
            <PinnedPoster key={poster} poster={poster} nav={nav} />
          ),
        )}
      </div>
    </>
  );
}

/** Scale the writing onto the board, centred, straight onto the style (no render per frame). */
function applyFit(box: HTMLElement | null, { width, height }: { width: number; height: number }) {
  if (!box || !width) return;
  const scale = Math.min(width / WRITING_WIDTH, MAX_SCALE);
  box.style.transform = `translateX(${(width - WRITING_WIDTH * scale) / 2}px) scale(${scale})`;
  box.style.height = `${height / scale}px`;
}

/** A poster's writing, pinned onto its board while it is up close. */
function PinnedPoster({ poster, nav }: { poster: Poster; nav: PosterNavigation }) {
  const setAnchor = useBuilding()?.setAnchor;
  const [el, setEl] = useState<HTMLElement | null>(null);
  const writing = useRef<HTMLDivElement>(null);
  const size = useRef({ width: 0, height: 0 });
  const shown = nav.open === poster && nav.arrived;

  // Pinned while mounted: the scene writes this element's place every frame.
  useEffect(() => {
    if (!el || !setAnchor) return;
    const name = `poster:${poster}`;
    setAnchor(name, el);
    return () => setAnchor(name, null);
  }, [el, setAnchor, poster]);

  useEffect(() => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      size.current = { width: entry.contentRect.width, height: entry.contentRect.height };
      applyFit(writing.current, size.current);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  return (
    <div
      ref={setEl}
      className={`absolute left-0 top-0 transition-opacity duration-300 ${shown ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <div
        ref={(box) => {
          writing.current = box;
          applyFit(box, size.current);
        }}
        style={{ width: WRITING_WIDTH }}
        className="h-full origin-top-left"
      >
        <PosterCard poster={poster} nav={nav} shown={shown} />
      </div>
    </div>
  );
}

const ICON = "size-5 shrink-0";

function PosterCard({ poster, nav, shown }: { poster: Poster; nav: PosterNavigation; shown: boolean }) {
  const copy = POSTER_COPY[poster];
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = `poster-${poster}-title`;
  const index = POSTER_ORDER.indexOf(poster) + 1;
  const position = POSTER_CONTROLS.position(index, POSTER_ORDER.length);

  // Into the poster once it is there.
  useEffect(() => {
    if (shown) heading.current?.focus({ preventScroll: true });
  }, [shown]);

  const step = nav.next ?? nav.previous;
  const forward = nav.next !== null;
  const control = forward ? POSTER_CONTROLS.next : POSTER_CONTROLS.previous;

  if (!shown) return null;
  return (
    <section
      aria-labelledby={headingId}
      className="flex h-full flex-col gap-3 overflow-hidden rounded-2xl border-2 border-ink bg-paper p-4 text-ink shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id={headingId}
          ref={heading}
          tabIndex={-1}
          className="pt-1 text-2xl font-bold uppercase tracking-wide"
          // Focus lands here to start reading; it isn't a control, so no ring (globals.css draws one on any :focus-visible).
          style={{ outline: "none" }}
        >
          {copy.title}
        </h2>
        <button
          type="button"
          aria-label={POSTER_CONTROLS.close}
          onClick={nav.close}
          className="grid size-12 shrink-0 place-items-center rounded-xl border-2 border-ink bg-surface transition-colors hover:bg-sunken"
        >
          <svg viewBox="0 0 24 24" className={ICON} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto text-[17px] leading-snug [scrollbar-width:thin]">
        {copy.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
        {copy.steps && (
          <ol className="flex list-inside list-decimal flex-col gap-1 font-semibold">
            {copy.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        {copy.closing && <p>{copy.closing}</p>}
      </div>

      {step && (
        <div className={`flex items-center gap-3 ${forward ? "justify-between" : "flex-row-reverse justify-between"}`}>
          <span className="text-sm font-semibold text-muted">{position}</span>
          <button
            type="button"
            aria-label={control.aria}
            disabled={!nav.arrived}
            onClick={() => nav.openPoster(step)}
            className={`${buttonClasses({ variant: "secondary", size: "md" })} min-h-12 ${forward ? "" : "flex-row-reverse"}`}
          >
            {control.label}
            <svg viewBox="0 0 24 24" className={`${ICON} ${forward ? "" : "rotate-180"}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      )}
    </section>
  );
}
