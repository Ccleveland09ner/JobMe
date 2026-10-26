/** Ms. Crystal as the shared character model plays her (room/Recruiter3D.tsx). */

import type { Look } from "@/components/room/types";

import { dressReceptionist } from "./character/dress";

export const RECEPTIONIST_LOOK: Look = {
  glasses: false,
  // Not staring the whole time she waits.
  idleGlances: true,
  dress: dressReceptionist,
  talkMotion: true,
};
