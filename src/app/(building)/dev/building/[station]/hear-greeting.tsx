"use client";

/** Dev only: owes a greeting, as signing in does, so the receptionist greets at the desk. */

import { oweGreeting } from "@/components/receptionist/greeting";
import { buttonClasses } from "@/components/ui/Button";

export function HearGreeting() {
  return (
    <button type="button" onClick={() => oweGreeting()} className={buttonClasses({ variant: "secondary", size: "sm" })}>
      Hear the greeting (as after signing in)
    </button>
  );
}
