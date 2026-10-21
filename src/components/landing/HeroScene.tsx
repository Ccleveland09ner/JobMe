/** Landing artwork: the campus building with a crowd walking past. Decorative. */

import Image from "next/image";

import { CrowdCanvas } from "./CrowdCanvas";

export function HeroScene() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* The art is wider than any window: crop the sides, keep the full height. */}
      <Image
        src="/images/campus.png"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />

      {/* Full height, so the back row's heads aren't clipped. */}
      <CrowdCanvas src="/images/crowd-peeps.png" className="absolute inset-0 h-full w-full" />
    </div>
  );
}
