"use client";

/**
 * The landing page's side of the scene's hovering words. Every word in the
 * scene (STEP INSIDE, ABOUT US, GUIDE, NEXT, BACK, CLOSE) runs a named action
 * registered here, and has a hidden twin button for the keyboard and screen
 * readers that lights the word while focused. An open signpost's writing is
 * real text pinned onto its stone face (ScreenAnchor), cut in like an
 * inscription, inside a polite live region. Without 3D the same controls are
 * plain buttons and the writing a plain card.
 */

import { Cinzel, EB_Garamond } from "next/font/google";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { buttonClasses } from "@/components/ui/Button";

import { useBuilding, useShow3D } from "../BuildingProvider";
import { StepInside } from "../StepInside";
import { pageOf, POSTER_COPY, PROXY_LABELS, type Poster } from "./copy";
import { LANDING_ACTIONS, POSTER_ORDER } from "./layout";
import { useSignPostNavigation, type SignPostNavigation } from "./useSignPostNavigation";

/** Cut into the stone: Roman inscription capitals for the heading, a book face for reading. */
const inscription = Cinzel({ weight: "700", subsets: ["latin"], fallback: ["Trajan Pro", "Georgia", "serif"] });
const book = EB_Garamond({ weight: "700", style: ["normal", "italic"], subsets: ["latin"], fallback: ["Garamond", "Georgia", "serif"] });

/** Width the writing is laid out at (CSS px), before scaling onto the face. */
const WRITING_WIDTH = 340;
/** No bigger than this on a large screen: centred on the face instead. */
const MAX_SCALE = 1.3;

export function LandingControls() {
  const building = useBuilding();
  const show3D = useShow3D();
  const router = useRouter();
  const nav = useSignPostNavigation();
  const { openPoster, close, goNext, goBack, open } = nav;
  const setAction = building?.setAction;
  const walkTo = building?.walkTo;

  useEffect(() => {
    if (!setAction) return;
    const actions: [string, () => void][] = [
      [
        LANDING_ACTIONS.stepInside,
        () => {
          walkTo?.("entrance");
          router.push("/login");
        },
      ],
      ...POSTER_ORDER.map((p): [string, () => void] => [LANDING_ACTIONS.poster(p), () => openPoster(p)]),
      [LANDING_ACTIONS.next, goNext],
      [LANDING_ACTIONS.back, goBack],
      [LANDING_ACTIONS.close, close],
      [LANDING_ACTIONS.outside, () => open !== null && close()],
    ];
    for (const [name, run] of actions) setAction(name, run);
    return () => {
      for (const [name] of actions) setAction(name, null);
    };
  }, [setAction, walkTo, router, openPoster, goNext, goBack, close, open]);

  const plain = show3D === false;
  const twin = useTwin();

  return (
    <>
      <nav
        aria-label="Outside the building"
        inert={open !== null}
        className={plain ? "pointer-events-auto mt-auto flex flex-wrap justify-center gap-3 px-4 pb-10" : "sr-only"}
      >
        <StepInside className={plain ? buttonClasses({ size: "lg" }) : undefined} {...twin(LANDING_ACTIONS.stepInside)}>
          {PROXY_LABELS.stepInside}
        </StepInside>
        {POSTER_ORDER.map((poster) => (
          <button
            key={poster}
            type="button"
            onClick={() => openPoster(poster)}
            className={plain ? buttonClasses({ variant: "secondary", size: "lg" }) : undefined}
            {...twin(LANDING_ACTIONS.poster(poster))}
          >
            {PROXY_LABELS.open[poster]}
          </button>
        ))}
      </nav>

      <div aria-live="polite" className="pointer-events-none fixed inset-0 z-30">
        {POSTER_ORDER.map((poster) =>
          plain ? (
            open === poster && (
              <div key={poster} className="pointer-events-auto absolute inset-0 m-auto h-fit max-h-[90dvh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto">
                <div className="rounded-2xl border-2 border-ink bg-paper p-5 text-ink shadow-lg">
                  <Writing poster={poster} nav={nav} shown plain />
                </div>
              </div>
            )
          ) : (
            <PinnedFace key={poster} poster={poster} nav={nav} />
          ),
        )}
      </div>
    </>
  );
}

/** Focus handlers that light a word in the scene while its hidden twin has focus. */
function useTwin() {
  const setHovered = useBuilding()?.setHovered;
  return (action: string) => ({
    onFocus: () => setHovered?.(action),
    onBlur: () => setHovered?.(null),
  });
}

/** Scale the writing onto the face, centred, straight onto the style (no render per frame). */
function applyFit(box: HTMLElement | null, { width, height }: { width: number; height: number }) {
  if (!box || !width) return;
  const scale = Math.min(width / WRITING_WIDTH, MAX_SCALE);
  box.style.transform = `translateX(${(width - WRITING_WIDTH * scale) / 2}px) scale(${scale})`;
  box.style.height = `${height / scale}px`;
}

/** A signpost's writing, pinned onto its face while it is open. */
function PinnedFace({ poster, nav }: { poster: Poster; nav: SignPostNavigation }) {
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
      className={`absolute left-0 top-0 transition-opacity duration-500 ${shown ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <div
        ref={(box) => {
          writing.current = box;
          applyFit(box, size.current);
        }}
        style={{ width: WRITING_WIDTH }}
        className="engraved h-full origin-top-left overflow-y-auto px-5 py-5 [scrollbar-width:none]"
      >
        {shown && <Writing poster={poster} nav={nav} shown />}
      </div>
    </div>
  );
}

function Writing({ poster, nav, shown, plain = false }: { poster: Poster; nav: SignPostNavigation; shown: boolean; plain?: boolean }) {
  const copy = POSTER_COPY[poster];
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = `poster-${poster}-title`;
  const twin = useTwin();

  // Into the writing once it is there.
  useEffect(() => {
    if (shown) heading.current?.focus({ preventScroll: true });
  }, [shown]);

  // Without 3D these are the only controls: visible buttons. With it, the hovering words are, and these their hidden twins.
  const control = plain ? buttonClasses({ variant: "secondary", size: "md" }) : undefined;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className={`${inscription.className} text-[26px] uppercase tracking-[0.1em]`}
        // Focus lands here to start reading; it isn't a control, so no ring (globals.css draws one on any :focus-visible).
        style={{ outline: "none" }}
      >
        {copy.title}
      </h2>
      {!plain && <div aria-hidden="true" className="engraved-rule" />}
      <p className="sr-only">{pageOf(POSTER_ORDER.indexOf(poster) + 1, POSTER_ORDER.length)}</p>
      <div className={`${book.className} flex flex-col gap-3 text-[19px] leading-[1.4]`}>
        {copy.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
        {copy.steps && (
          <ol className="flex list-inside list-decimal flex-col gap-1.5 text-[21px]">
            {copy.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        )}
        {copy.closing && <p className="mt-1 text-[21px] italic">{copy.closing}</p>}
      </div>
      <div className={plain ? "mt-2 flex flex-wrap justify-end gap-2" : "sr-only"}>
        {nav.previous && (
          <button type="button" onClick={nav.goBack} className={control} {...twin(LANDING_ACTIONS.back)}>
            {PROXY_LABELS.back}
          </button>
        )}
        {nav.next && (
          <button type="button" onClick={nav.goNext} className={control} {...twin(LANDING_ACTIONS.next)}>
            {PROXY_LABELS.next}
          </button>
        )}
        <button type="button" onClick={nav.close} className={control} {...twin(LANDING_ACTIONS.close)}>
          {PROXY_LABELS.close}
        </button>
      </div>
    </section>
  );
}
