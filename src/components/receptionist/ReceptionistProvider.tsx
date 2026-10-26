"use client";

/**
 * Ms. Crystal at the front desk: she greets the user each time they come
 * into reception (a first visit or a return) and sees them off when they sign
 * out. One controller runs each line through its whole life
 * (receptionistMachine.ts), so her voice, mouth, speech bubble and the lobby
 * music move together:
 *
 *   music pauses → bubble appears, she speaks → voice ends → bubble fades →
 *   bubble gone → music comes back (greeting) or the sign-out goes on (goodbye).
 *
 * She speaks only with the 3D building, once her model is drawn. Without
 * sound (voice off on the settings board, autoplay refused, a clip that won't
 * load) the bubble still carries every word, and nothing ever waits on audio.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import { useBuilding } from "@/components/building/BuildingProvider";
import { hushMusic } from "@/components/building/music";
import type { Station } from "@/components/building/stations";
import type { Speaker } from "@/components/room/types";
import { useReceptionistVoice } from "@/lib/frontend/preferences";
import { sampleVisemes, type SpeechTimeline } from "@/lib/voice/lipsync";
import { createClient } from "@/lib/supabase/client";

import { timelineFor } from "./clips";
import { pickLine, type Line, type LineKind } from "./lines";
import { dialogueReducer, initialDialogue, type DialogueEvent, type Purpose, type ReceptionistDialogue } from "./receptionistMachine";
import { deviceStatus, lastLineId, loadVisitorFacts, markWelcomed, rememberLine, visitorStatus, type VisitorStatus } from "./visitor";
import { loadClip, speakLine, stopReceptionist, type Speech } from "./voice";

export interface Receptionist {
  /** Read every frame by her model. */
  speaker: RefObject<Speaker>;
  dialogue: ReceptionistDialogue;
  /** The line being said, timed, and how far into it she is (seconds). */
  timeline: SpeechTimeline | null;
  now: () => number;
  /** The bubble's exit has finished. */
  bubbleGone: (id: number) => void;
  /** Her model has drawn its first frame: she can be seen. */
  setReady: () => void;
}

const ReceptionistContext = createContext<Receptionist | null>(null);

export function useReceptionist(): Receptionist | null {
  return useContext(ReceptionistContext);
}

/** Reception: she is at the desk; the notice board is on the wall behind her. */
const RECEPTION: ReadonlySet<Station> = new Set(["desk", "noteboard"]);

/** A beat after arriving before she speaks up. */
const GREET_DELAY_MS = 350;
/** The longest she'll wait to learn who's arrived before greeting with what this device knows. */
const STATUS_TIMEOUT_MS = 2000;
/** The bubble's exit, if it never reports (hidden, unmounted). */
const BUBBLE_EXIT_TIMEOUT_MS = 1000;
/** How long the music waits for her model to load the first time, before playing anyway. */
const MODEL_LOAD_GRACE_MS = 15000;
/** Signing out walks back to the desk for the goodbye; give up on the walk after this. */
const DESK_WALK_TIMEOUT_MS = 6000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const within = <T,>(promise: Promise<T>, ms: number, fallback: T) => Promise.race([promise, sleep(ms).then(() => fallback)]);

export function ReceptionistProvider({ children }: { children: ReactNode }) {
  const building = useBuilding();
  const voiceOn = useReceptionistVoice();

  // The machine in a ref (async steps read it) and in state (the bubble renders it).
  const machine = useRef(initialDialogue);
  const [dialogue, setDialogue] = useState(initialDialogue);
  const send = useCallback((event: DialogueEvent) => {
    const next = dialogueReducer(machine.current, event);
    if (next !== machine.current) {
      machine.current = next;
      setDialogue(next);
    }
    return next;
  }, []);

  const speaker = useRef<Speaker>({ state: "idle" });
  const speech = useRef<Speech | null>(null);
  const [timeline, setTimeline] = useState<SpeechTimeline | null>(null);
  const now = useCallback(() => speech.current?.now() ?? -1, []);

  // Waiters for the bubble's exit, by line id.
  const exits = useRef(new Map<number, () => void>());
  const bubbleGone = useCallback((id: number) => {
    exits.current.get(id)?.();
    exits.current.delete(id);
  }, []);

  const [ready, setReadyState] = useState(false);
  const setReady = useCallback(() => setReadyState(true), []);
  // Her model's first load: the music waits for her this long at most.
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), MODEL_LOAD_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);

  const latest = useRef({ building, voiceOn });
  useEffect(() => {
    latest.current = { building, voiceOn };
  });

  /** Says `line` from start to finish; resolves once her bubble is gone. False if she was busy. */
  const say = useCallback(
    async (line: Line, purpose: Purpose, onSpeak?: () => void): Promise<boolean> => {
      const prepared = send({ type: "PREPARE", line, purpose });
      if (prepared.phase !== "preparing" || prepared.line !== line) return false;
      const { id } = prepared;
      // The music goes quiet first: she always comes before the soundtrack.
      const releaseMusic = hushMusic();
      const cutShort = () => machine.current.id !== id;

      const lineTimeline = timelineFor(line);
      const voiced = latest.current.voiceOn && (await loadClip(line));
      if (cutShort() || machine.current.phase !== "preparing") {
        releaseMusic();
        return true;
      }

      const said = speakLine(line, lineTimeline, latest.current.voiceOn && voiced);
      speech.current = said;
      setTimeline(lineTimeline);
      speaker.current = {
        ...speaker.current,
        state: "speaking",
        readVisemes: () => {
          const t = said.now();
          return t < 0 ? {} : sampleVisemes(lineTimeline, t);
        },
      };
      send({ type: "SPEAK", id });
      onSpeak?.();

      await said.done;
      speaker.current = { ...speaker.current, state: "idle", readVisemes: undefined };
      send({ type: "SPOKEN", id });

      // Only once the bubble has gone does the music come back.
      await within(new Promise<void>((resolve) => exits.current.set(id, resolve)), BUBBLE_EXIT_TIMEOUT_MS, undefined);
      exits.current.delete(id);
      send({ type: "GONE", id });
      if (speech.current === said) speech.current = null;
      // A goodbye keeps the music quiet: the user is on their way out.
      if (purpose === "greeting") releaseMusic();
      return true;
    },
    [send],
  );

  /** Cuts her short (the user walked away): the voice stops, the bubble leaves. */
  const cut = useCallback(() => {
    stopReceptionist();
    send({ type: "CANCEL" });
  }, [send]);

  // Who's arriving: asked once, then kept (and updated once she's met them).
  const status = useRef<Promise<VisitorStatus> | null>(null);
  const visitor = useCallback((): Promise<VisitorStatus> => {
    status.current ??= loadVisitorFacts(createClient()).then((facts) => {
      // Signed out (the dev viewer): ask again next time, it may be someone else.
      if (!facts.known) status.current = null;
      return visitorStatus(facts);
    });
    return status.current;
  }, []);

  const greet = useCallback(async () => {
    const who = await within(visitor(), STATUS_TIMEOUT_MS, deviceStatus());
    const b = latest.current.building;
    if (!b || b.cameraAt !== "desk" || b.leaving) return;
    const kind: LineKind = who === "new" ? "new" : "returning";
    const line = pickLine(kind, lastLineId());
    rememberLine(line.id);
    await say(line, "greeting", () => {
      if (kind !== "new") return;
      // Welcomed: from now on (here and on any device) a returning visitor.
      status.current = Promise.resolve("returning");
      void markWelcomed(createClient());
    });
  }, [say, visitor]);

  // A greeting is owed each time the user comes into reception from elsewhere (or opens the site there).
  const cameraAt = building?.cameraAt ?? null;
  const leaving = building?.leaving ?? false;
  const show3D = building?.show3D ?? false;
  const [owed, setOwed] = useState(true);
  const [lastSettled, setLastSettled] = useState(cameraAt);
  if (cameraAt !== lastSettled) {
    setLastSettled(cameraAt);
    if (cameraAt !== null && !RECEPTION.has(cameraAt)) setOwed(true);
  }
  const greeting = useRef(false);
  useEffect(() => {
    if (cameraAt !== "desk" || !owed || leaving || !show3D || !ready || greeting.current) return;
    const timer = setTimeout(() => {
      greeting.current = true;
      void greet().finally(() => {
        greeting.current = false;
        setOwed(false);
      });
    }, GREET_DELAY_MS);
    return () => clearTimeout(timer);
  }, [cameraAt, owed, leaving, show3D, ready, greet]);

  // On the way to the desk with a greeting owed, the music waits for her (she hushes it herself once she starts).
  const heading = building ? (building.state.target ?? building.state.station) : null;
  const waitingToGreet = owed && heading === "desk" && !leaving && show3D && (ready || loading);
  useEffect(() => (waitingToGreet ? hushMusic() : undefined), [waitingToGreet]);

  // Walking out of reception (to the corridor, the room) cuts a greeting short.
  useEffect(() => {
    if (heading && !RECEPTION.has(heading) && machine.current.purpose === "greeting") cut();
  }, [heading, cut]);
  // The 3D building gone (a lost context): no one left to speak.
  useEffect(() => {
    if (!show3D) cut();
  }, [show3D, cut]);

  // Arrivals at the desk, for the goodbye's walk back to it.
  const atDesk = useRef<(() => void)[]>([]);
  const settledAtDesk = cameraAt === "desk" && building?.state.target === null;
  useEffect(() => {
    if (!settledAtDesk) return;
    for (const resolve of atDesk.current.splice(0)) resolve();
  }, [settledAtDesk]);

  // Signing out: back at the desk, she says goodbye, and only then does the user leave.
  const farewell = useCallback(async () => {
    const b = latest.current.building;
    if (!b?.show3D || !ready) return;
    if (machine.current.phase !== "idle") {
      cut();
      await within(
        new Promise<void>((resolve) => {
          const check = () => (machine.current.phase === "idle" ? resolve() : setTimeout(check, 50));
          check();
        }),
        BUBBLE_EXIT_TIMEOUT_MS + 200,
        undefined,
      );
    }
    const where = latest.current.building ?? b;
    if (!(where.cameraAt === "desk" && where.state.target === null)) {
      const arrived = new Promise<void>((resolve) => atDesk.current.push(resolve));
      where.walkTo("desk");
      await within(arrived, DESK_WALK_TIMEOUT_MS, undefined);
    }
    const line = pickLine("goodbye", lastLineId());
    rememberLine(line.id);
    await say(line, "goodbye");
  }, [ready, cut, say]);

  const setFarewell = building?.setFarewell;
  useEffect(() => {
    if (!setFarewell) return;
    setFarewell(farewell);
    return () => setFarewell(null);
  }, [setFarewell, farewell]);

  // Leaving the building's pages: she stops.
  useEffect(() => () => stopReceptionist(), []);

  const value = useMemo<Receptionist>(
    () => ({ speaker, dialogue, timeline, now, bubbleGone, setReady }),
    [dialogue, timeline, now, bubbleGone, setReady],
  );

  return <ReceptionistContext.Provider value={value}>{children}</ReceptionistContext.Provider>;
}
