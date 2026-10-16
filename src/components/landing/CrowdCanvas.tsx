"use client";

/**
 * The crowd outside the career center: a sprite sheet of people walked across
 * the hero on a 2D canvas.
 * Ref: design/Landing page.png
 *
 * Adapted from Skiper UI's Skiper39, itself after zadvorsky's CodePen, with
 * illustrations from openpeeps.com. Changed here: typed throughout, scaled to
 * the stage instead of drawn at native size, held still under
 * prefers-reduced-motion, and hidden from assistive tech.
 *
 * Canvas 2D rather than WebGL deliberately — 105 sprites blitted per frame is
 * well inside what 2D handles, and it keeps a 3D runtime off the landing page.
 */

import { gsap } from "gsap";
import { useEffect, useRef } from "react";

/** public/images/crowd-peeps.png is 3600x2268: 15 sprites across, 7 down. */
const SHEET_COLS = 15;
const SHEET_ROWS = 7;

/**
 * Stage height at which a sprite draws at native size; smaller stages scale
 * down. Tuned so the canvas can span the whole hero — doubled sprites need
 * the headroom, and a short canvas clipped the back row's heads — while the
 * crowd still reads at the size it did over the old 62%-tall canvas.
 */
const REFERENCE_HEIGHT = 1160;

/**
 * How large the crowd reads, as a multiple of that reference.
 *
 * Set against the backdrop rather than picked by eye. In the campus art the
 * doorway is 175px of 843 and the building 570px, so on a 1080px window they
 * land at roughly 224px and 730px. At 1 a peep draws 302px: still half again
 * the doorway, so the crowd reads as nearer the camera than the entrance, and
 * about two fifths of the building, so the building clearly stays the larger
 * thing. True architectural scale would be near 0.65, which puts the crowd
 * too far off to be the foreground.
 *
 * Applied to the SPRITE only, not to the depth offsets below. Those fake
 * distance by lifting peeps up the stage, and scaling the lift as well would
 * change how far the crowd spreads rather than how big it is drawn.
 */
const CROWD_SCALE = 1;

/** Past 2x, retina costs fill rate and buys nothing at this size. */
const MAX_DPR = 2;

/** Seconds to cross the stage. The one number that sets walking speed. */
const CROSS_SECONDS = 12;

/**
 * Bobs per crossing, held constant so changing the speed above moves cadence
 * and not stride. Slowing the travel alone would keep the step rate up and
 * leave the crowd mincing along; deriving the bob from the crossing keeps a
 * step the same length however fast they walk.
 */
const BOBS_PER_CROSSING = 40;
const BOB_SECONDS = CROSS_SECONDS / BOBS_PER_CROSSING;

interface Peep {
  /** Source rect in the sheet. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Destination size, after stage scaling. */
  width: number;
  height: number;
  x: number;
  y: number;
  /** Baseline used to sort front-to-back. */
  anchorY: number;
  /** -1 flips the sprite to walk the other way. */
  scaleX: number;
  walk: gsap.core.Timeline | null;
}

export interface CrowdCanvasProps {
  src: string;
  className?: string;
}

export function CrowdCanvas({ src, className }: CrowdCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvasRef.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;

    // Rebound as non-nullable: `render` and `layout` below are hoisted
    // function declarations, and TypeScript will not carry the narrowing
    // from the guard above into those.
    const canvas: HTMLCanvasElement = element;
    const ctx: CanvasRenderingContext2D = context;

    /**
     * Read once, not subscribed: someone changing this preference mid-visit
     * is not worth a listener that has to tear down and rebuild the crowd.
     */
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // `scale` draws the sprite; `depth` spaces the rows back from the front.
    const stage = { width: 0, height: 0, scale: 1, depth: 1 };
    const all: Peep[] = [];
    const waiting: Peep[] = [];
    const crowd: Peep[] = [];
    let disposed = false;

    const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
    const takeRandom = (array: Peep[]) =>
      array.splice(Math.floor(Math.random() * array.length), 1)[0];

    const image = new Image();

    function buildPeeps() {
      const sw = image.naturalWidth / SHEET_COLS;
      const sh = image.naturalHeight / SHEET_ROWS;
      for (let i = 0; i < SHEET_COLS * SHEET_ROWS; i++) {
        all.push({
          sx: (i % SHEET_COLS) * sw,
          sy: Math.floor(i / SHEET_COLS) * sh,
          sw,
          sh,
          width: sw,
          height: sh,
          x: 0,
          y: 0,
          anchorY: 0,
          scaleX: 1,
          walk: null,
        });
      }
    }

    /** Places a peep off one edge, facing the way it will travel. */
    function placeAtEdge(peep: Peep) {
      peep.width = peep.sw * stage.scale;
      peep.height = peep.sh * stage.scale;

      // Bias the crowd toward the foreground: `power2.in` clusters offsets
      // near zero, so most peeps stand on the baseline and a few hang back.
      const offsetY = 100 - 250 * (gsap.parseEase("power2.in") as (n: number) => number)(Math.random());
      const startY = stage.height - peep.height + offsetY * stage.depth;
      const rightward = Math.random() > 0.5;

      peep.scaleX = rightward ? 1 : -1;
      peep.x = rightward ? -peep.width : stage.width + peep.width;
      peep.y = startY;
      peep.anchorY = startY;

      return { startY, endX: rightward ? stage.width + peep.width : -peep.width };
    }

    function sortByDepth() {
      crowd.sort((a, b) => a.anchorY - b.anchorY);
    }

    function addToCrowd() {
      const peep = takeRandom(waiting);
      if (!peep) return null;
      const { startY, endX } = placeAtEdge(peep);

      const timeline = gsap.timeline();
      timeline.timeScale(randomBetween(0.5, 1.5));
      timeline.to(peep, { duration: CROSS_SECONDS, x: endX, ease: "none" }, 0);
      // The bob is what sells it as walking rather than sliding.
      timeline.to(
        peep,
        {
          duration: BOB_SECONDS,
          repeat: BOBS_PER_CROSSING,
          yoyo: true,
          y: startY - 10 * stage.depth,
        },
        0,
      );
      timeline.eventCallback("onComplete", () => {
        crowd.splice(crowd.indexOf(peep), 1);
        waiting.push(peep);
        addToCrowd();
      });

      peep.walk = timeline;
      crowd.push(peep);
      sortByDepth();
      return peep;
    }

    /** One frozen frame: every peep scattered where a walk would have it. */
    function fillStill() {
      let peep = takeRandom(waiting);
      while (peep) {
        const { startY } = placeAtEdge(peep);
        peep.x = randomBetween(-peep.width * 0.5, stage.width);
        peep.y = startY;
        crowd.push(peep);
        peep = takeRandom(waiting);
      }
      sortByDepth();
    }

    function render() {
      if (disposed) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(dpr, dpr);
      for (const peep of crowd) {
        ctx.save();
        ctx.translate(peep.x, peep.y);
        ctx.scale(peep.scaleX, 1);
        // A flipped sprite draws leftward from the origin, so shift it back.
        ctx.drawImage(
          image,
          peep.sx,
          peep.sy,
          peep.sw,
          peep.sh,
          peep.scaleX === -1 ? -peep.width : 0,
          0,
          peep.width,
          peep.height,
        );
        ctx.restore();
      }
      ctx.restore();
    }

    function layout() {
      if (disposed) return;
      // Rebuilding restarts every walk, so ignore the sub-pixel reflows a
      // ResizeObserver reports for a box that did not really change.
      const unchanged =
        canvas.clientWidth === stage.width && canvas.clientHeight === stage.height;
      if (unchanged && crowd.length) return;

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      stage.width = canvas.clientWidth;
      stage.height = canvas.clientHeight;
      stage.depth = Math.min(1, stage.height / REFERENCE_HEIGHT);
      stage.scale = stage.depth * CROWD_SCALE;
      canvas.width = Math.round(stage.width * dpr);
      canvas.height = Math.round(stage.height * dpr);

      for (const peep of crowd) peep.walk?.kill();
      crowd.length = 0;
      waiting.length = 0;
      waiting.push(...all);

      if (still) {
        fillStill();
        render();
        return;
      }
      // Start each walk part-way through, or the crowd marches in formation.
      while (waiting.length) addToCrowd()?.walk?.progress(Math.random());
    }

    image.onload = () => {
      if (disposed) return;
      buildPeeps();
      layout();
      if (!still) gsap.ticker.add(render);
    };
    image.src = src;

    /**
     * Element-sized, not window-sized: the hero changes height with its own
     * content and with mobile browser chrome, neither of which fires `resize`.
     */
    const observer = new ResizeObserver(() => layout());
    observer.observe(canvas);

    return () => {
      disposed = true;
      observer.disconnect();
      gsap.ticker.remove(render);
      for (const peep of crowd) peep.walk?.kill();
      image.onload = null;
    };
  }, [src]);

  // Decorative: the headline and copy carry the meaning, and the canvas must
  // never swallow a click meant for the call to action behind it.
  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
