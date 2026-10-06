"use client";

/**
 * End early: confirm, then go to the scorecard for the answered questions.
 * The report route needs at least one answer, so with none the trigger is
 * disabled and says why, rather than failing after the click.
 */

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

export function EndInterviewDialog({
  answered,
  disabled,
  onConfirm,
}: {
  answered: number;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  const none = answered === 0;

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled || none}
        title={none ? "Answer at least one question to get a scorecard" : undefined}
      >
        End interview
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="End the interview now?"
        description={`You'll get a scorecard for the ${answered} ${answered === 1 ? "question" : "questions"} you've answered.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep going
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              End and see scorecard
            </Button>
          </>
        }
      />
    </>
  );
}
