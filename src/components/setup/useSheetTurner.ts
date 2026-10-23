"use client";

/**
 * Turning the setup sheets: one turn at a time, each sheet checked before it
 * turns, and focus placed once the sheet on top (or its problems) has
 * rendered. A refused turn says what's wrong, on the sheet that has it.
 */

import { useEffect, useRef, useState } from "react";

import type { BookSliderHandle, BookState } from "@/components/ui/book-slider";
import { REVIEW_SHEET, validateSetupSheet, type SetupErrors, type SetupValues } from "@/lib/frontend/setup";

import { sheetHeadingId } from "./SetupSheets";

export function useSheetTurner({ values, busy }: { values: SetupValues; busy: boolean }) {
  // The sheet on top, its problems, and how many turns were refused.
  const [sheet, setSheet] = useState(0);
  const [errors, setErrors] = useState<SetupErrors>({});
  const [attempt, setAttempt] = useState(0);
  const slider = useRef<BookSliderHandle>(null);
  const stack = useRef<HTMLDivElement>(null);
  // One turn at a time: a second click mid-turn would skip a sheet's check.
  const turning = useRef<number | undefined>(undefined);
  // What to focus once the sheet on top, or its problems, have rendered.
  const focusNext = useRef<"heading" | "problem" | null>(null);

  useEffect(() => {
    const what = focusNext.current;
    focusNext.current = null;
    if (what === "heading") document.getElementById(sheetHeadingId(sheet))?.focus({ preventScroll: true });
    if (what === "problem")
      stack.current?.querySelector<HTMLElement>(`[data-sheet="${sheet}"] :is([aria-invalid="true"], [data-invalid])`)?.focus();
  }, [sheet, attempt]);
  useEffect(() => () => window.clearTimeout(turning.current), []);

  function turn(to: (s: BookSliderHandle) => void, focus: "heading" | "problem" = "heading") {
    const s = slider.current;
    if (!s || turning.current !== undefined) return;
    focusNext.current = focus;
    // Cleared when the sheet lands, or after a while if it never turns.
    turning.current = window.setTimeout(() => (turning.current = undefined), 1500);
    to(s);
  }

  function onPageChange(state: BookState) {
    window.clearTimeout(turning.current);
    turning.current = undefined;
    setSheet(state.page);
  }

  function refuse(problems: SetupErrors, at: number) {
    setErrors(problems);
    setAttempt((n) => n + 1);
    if (at === sheet) focusNext.current = "problem";
    else turn((s) => s.turnTo(at), "problem");
  }

  function next() {
    if (busy || sheet >= REVIEW_SHEET || turning.current !== undefined) return;
    const problems = validateSetupSheet(sheet, values);
    if (Object.keys(problems).length) return refuse(problems, sheet);
    setErrors({});
    turn((s) => s.next());
  }

  function back() {
    if (busy) return;
    setErrors({});
    turn((s) => s.prev());
  }

  function change(to: number) {
    if (busy) return;
    setErrors({});
    turn((s) => s.turnTo(to));
  }

  /** A sheet's problems: only the sheet on top shows any. */
  const problemsOn = (at: number) => (at === sheet ? errors : {});

  return { attempt, slider, stack, problemsOn, onPageChange, refuse, next, back, change };
}
