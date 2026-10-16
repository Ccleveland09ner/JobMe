/**
 * The landing page's artwork: the campus building, with a crowd walking
 * across the plaza in front of it.
 * Ref: design/Symmetrical Campus Building in Ink.png
 *
 * Server component — only the crowd itself is a client island. Purely
 * decorative and click-through, so it sits behind the hero copy; everything a
 * visitor needs to read or click is in <Home>.
 *
 * The backdrop is the whole mockup, flattened to grayscale by
 * `npm run prep:art`. Nothing is cut out of it: unlike the earlier mockup,
 * this one has no crowd drawn in for the animated one to replace.
 */

import Image from "next/image";

import { CrowdCanvas } from "./CrowdCanvas";

export function HeroScene() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/*
        `cover` on art wider (2.21:1) than any ordinary window crops the sides
        and keeps the full height, so the roofline and the plaza both stay in
        frame and only the outer trees are lost. Centred for the same reason —
        the entrance is the middle of the composition.
      */}
      <Image
        src="/images/campus.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />

      {/*
        Spans the whole hero, not just the band the crowd stands in: peeps are
        anchored to the bottom either way, and the extra height is what keeps
        the back row's heads from being clipped off at the canvas edge.
      */}
      <CrowdCanvas src="/images/crowd-peeps.png" className="absolute inset-0 h-full w-full" />
    </div>
  );
}
