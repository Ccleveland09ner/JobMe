import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A fake SpeechRecognition like Chrome without the offline pack: on-device start() fails. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  static available: ((opts: unknown) => Promise<string>) | undefined;
  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 1;
  processLocally = false;
  onstart: ((e: unknown) => void) | null = null;
  onend: ((e: unknown) => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  onresult: ((e: unknown) => void) | null = null;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    setTimeout(() => {
      if (this.processLocally) {
        this.onerror?.({ error: "language-not-supported" });
        this.onend?.({});
      } else {
        this.onstart?.({});
      }
    }, 0);
  }
  stop() {
    setTimeout(() => this.onend?.({}), 0);
  }
  abort() {}
}

async function freshRecognizer() {
  vi.resetModules(); // the on-device answer is cached per page load
  const { createRecognizer } = await import("./stt");
  const states: string[] = [];
  const rec = createRecognizer({ onState: (s) => states.push(`${s.phase}:${s.endedBy ?? ""}`) });
  await Promise.resolve(); // let the on-device check answer
  await Promise.resolve();
  return { rec, states };
}

describe("createRecognizer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecognition.instances = [];
    FakeRecognition.available = undefined;
    (globalThis as unknown as { window: unknown }).window = { webkitSpeechRecognition: FakeRecognition };
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("uses online recognition where on-device is not offered", async () => {
    const { rec } = await freshRecognizer();
    rec.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeRecognition.instances[0].processLocally).toBe(false);
    expect(rec.getState().phase).toBe("running");
  });

  it("does not force on-device when the model is only downloadable", async () => {
    FakeRecognition.available = async () => "downloadable";
    const { rec } = await freshRecognizer();
    rec.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeRecognition.instances[0].processLocally).toBe(false);
    expect(rec.getState().phase).toBe("running");
  });

  it("falls back to online, not to typing, when on-device refuses to start", async () => {
    FakeRecognition.available = async () => "available";
    const { rec, states } = await freshRecognizer();
    rec.start();
    await vi.advanceTimersByTimeAsync(1000);
    // First attempt on-device (it said "available"), refused; then online.
    expect(FakeRecognition.instances[0].processLocally).toBe(true);
    expect(FakeRecognition.instances.at(-1)!.processLocally).toBe(false);
    expect(rec.getState().phase).toBe("running");
    expect(states.some((s) => s.endsWith(":fatal"))).toBe(false);
  });
});
