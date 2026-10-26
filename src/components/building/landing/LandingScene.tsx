"use client";

/**
 * What the landing page adds to the street: the plaque over the door, the
 * beaming tile that leads in, and the two poster stands beside the path.
 */

import { EntranceSign } from "./EntranceSign";
import { POSTER_ORDER } from "./layout";
import { PosterStand } from "./PosterStand";
import { StepInsideTile } from "./StepInsideTile";

export function LandingScene() {
  return (
    <group>
      <EntranceSign />
      <StepInsideTile />
      {POSTER_ORDER.map((poster, i) => (
        <PosterStand key={poster} poster={poster} order={i} />
      ))}
    </group>
  );
}
