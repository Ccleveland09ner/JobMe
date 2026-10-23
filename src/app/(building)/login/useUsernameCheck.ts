"use client";

import { useRef, useState } from "react";

import { usernameProblem } from "@/lib/frontend/account";

export type NameCheck = "idle" | "checking" | "available" | "taken";

/**
 * Whether a username is free, checked when its field is left. Each check and
 * each edit supersede the last, so a slow answer about an older name never
 * lands on the new one.
 */
export function useUsernameCheck(isAvailable: (name: string) => Promise<boolean | null>) {
  const [status, setStatus] = useState<NameCheck>("idle");
  const version = useRef(0);

  async function check(raw: string) {
    const current = ++version.current;
    const name = raw.trim();
    if (!name || usernameProblem(name)) {
      setStatus("idle");
      return;
    }
    setStatus("checking");
    const free = await isAvailable(name);
    // The name was edited meanwhile: this answer is about the old one.
    if (current !== version.current) return;
    // Unknown (the check itself failed): say nothing; the sign-up decides.
    setStatus(free === null ? "idle" : free ? "available" : "taken");
  }

  /** The name changed: what was known is about the old one. */
  function edited() {
    version.current++;
    setStatus("idle");
  }

  /** The sign-up found it taken. */
  function taken() {
    setStatus("taken");
  }

  return { status, check, edited, taken };
}
