"use client";

/**
 * What the landing page adds to the street: the plaque over the door, the
 * signal paver that leads in, and the two stone signposts beside the path.
 */

import { EntranceSign } from "./EntranceSign";
import { POSTER_ORDER } from "./layout";
import { SignPost } from "./SignPost";
import { StepInsideTile } from "./StepInsideTile";

export function LandingScene() {
  return (
    <group>
      <EntranceSign />
      <StepInsideTile />
      {POSTER_ORDER.map((poster, i) => (
        <SignPost key={poster} poster={poster} order={i} />
      ))}
    </group>
  );
}
