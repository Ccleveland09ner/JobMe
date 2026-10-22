"use client";

/**
 * End early: confirm, then go to the scorecard. With no answers yet the
 * dialog explains instead (the report needs one).
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
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        End interview
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={none ? "Nothing to score yet" : "End the interview now?"}
        description={
          none
            ? "Answer at least one question to get a scorecard. You can also leave and continue later from your dashboard."
            : `You'll get a scorecard for the ${answered} ${answered === 1 ? "question" : "questions"} you've answered.`
        }
        actions={
          <>
            <Button variant={none ? "primary" : "secondary"} onClick={() => setOpen(false)}>
              Keep going
            </Button>
            {!none && (
              <Button
                onClick={() => {
                  setOpen(false);
                  onConfirm();
                }}
              >
                End and see scorecard
              </Button>
            )}
          </>
        }
      />
    </>
  );
}
