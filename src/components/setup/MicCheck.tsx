"use client";

/**
 * Live mic level meter, so nobody finds out their mic is dead mid-interview.
 * Ref: docs/PRD-JobMe-MVP.md > Interview Setup
 *
 * getUserMedia + AnalyserNode -> a level bar. Started by a click, not on
 * load: a permission prompt the moment the page opens is hostile, and the
 * click is also the user gesture some browsers want before audio.
 *
 * Denied permission: explain how to re-enable it AND offer typed answers.
 * Unsupported browser: "Best in Chrome or Edge" plus the same typed
 * fallback. Neither case is a dead end.
 *
 * Reports the resulting input mode upward; the room reads it from `?input=`.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/Button";
import type { InputMode } from "@/lib/frontend/types";
import { isSttSupported } from "@/lib/voice/stt";

type MicStatus = "idle" | "checking" | "allowed" | "denied" | "no-device" | "error";

/** Capability does not change while the page is open; nothing to subscribe to. */
const neverChanges = () => () => {};

function browserSupportsVoice(): boolean {
  return isSttSupported() && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function MicCheck({ onInputModeChange }: { onInputModeChange: (mode: InputMode) => void }) {
  // null on the server: speech support is a browser fact, and guessing it
  // there would mismatch on hydration.
  const speechSupported = useSyncExternalStore(neverChanges, browserSupportsVoice, () => null);
  const [status, setStatus] = useState<MicStatus>("idle");
  const [preferTyped, setPreferTyped] = useState(false);
  const [level, setLevel] = useState(0);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  const voiceReady = speechSupported === true && status === "allowed" && !preferTyped;
  useEffect(() => {
    onInputModeChange(voiceReady ? "voice" : "typed");
  }, [voiceReady, onInputModeChange]);

  async function start() {
    cleanup.current?.();
    setStatus("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      let raf = 0;
      let smooth = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        smooth = smooth * 0.8 + Math.min(1, rms * 4) * 0.2;
        setLevel(smooth);
        raf = requestAnimationFrame(tick);
      };
      tick();
      cleanup.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
        cleanup.current = null;
      };
      setStatus("allowed");
    } catch (err) {
      const name = (err as DOMException)?.name;
      setStatus(
        name === "NotAllowedError" || name === "SecurityError"
          ? "denied"
          : name === "NotFoundError"
            ? "no-device"
            : "error",
      );
    }
  }

  function stop() {
    cleanup.current?.();
    setLevel(0);
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium text-ink">Microphone</legend>

      {speechSupported === null ? (
        <p className="text-sm text-muted">Checking your browser…</p>
      ) : !speechSupported ? (
        <Notice>
          Voice answers work best in Chrome or Edge. In this browser you&rsquo;ll type your answers — the
          interview and the notepad work exactly the same.
        </Notice>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {status === "allowed" ? (
              <Button variant="secondary" size="sm" onClick={stop}>
                Stop test
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={start} disabled={status === "checking"}>
                {status === "checking" ? "Waiting for permission…" : "Test microphone"}
              </Button>
            )}
            <div className="flex min-w-40 flex-1 items-center gap-2">
              <span className="text-xs text-muted">Level</span>
              <span
                role="meter"
                aria-label="Microphone level"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(level * 100)}
                className="h-2 flex-1 overflow-hidden rounded-full bg-sunken"
              >
                <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(level * 100)}%` }} />
              </span>
            </div>
          </div>

          <div aria-live="polite" className="text-sm">
            {status === "idle" && <p className="text-muted">Say a few words after starting the test — the bar should move.</p>}
            {status === "allowed" && <p className="text-score-4">Microphone working. Speak and watch the bar move.</p>}
            {status === "denied" && (
              <Notice>
                Microphone access is blocked. To allow it, click the lock or site-settings icon in the address bar,
                set Microphone to Allow, then test again. Or type your answers instead.
              </Notice>
            )}
            {status === "no-device" && <Notice>No microphone was found. Connect one and test again, or type your answers.</Notice>}
            {status === "error" && <Notice>We couldn&rsquo;t start your microphone. Try again, or type your answers.</Notice>}
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={preferTyped}
              onChange={(e) => setPreferTyped(e.target.checked)}
              className="accent-accent"
            />
            Type my answers instead
          </label>
        </>
      )}

      <p className="text-sm text-muted">
        {voiceReady ? "You'll answer out loud." : "You'll type your answers."}
      </p>
    </fieldset>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-sunken px-3 py-2 text-sm text-ink">{children}</p>;
}
