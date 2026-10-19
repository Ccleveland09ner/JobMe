"use client";

/**
 * The interviewer's notepad, picked up off the table: one page per answered
 * question, newest on top, flipped like a notepad.
 *
 * Shows only `notes` — the entries the server has already returned for this
 * interview, exactly what the old always-on notepad showed — so picking it up
 * never reveals anything early. Each page is the existing NotepadEntry.
 */

import { useState } from "react";

import { HeldPad, Pages } from "@/components/held/Held";
import type { NoteView } from "@/lib/frontend/types";

import { NotepadEntry } from "./NotepadEntry";

export function HeldNotepad({ notes, onClose }: { notes: NoteView[]; onClose: () => void }) {
  const newestFirst = [...notes].reverse();
  const [page, setPage] = useState(0);
  const at = Math.min(page, Math.max(0, newestFirst.length - 1));

  return (
    <HeldPad title="Recruiter's notepad" kicker={`${notes.length} ${notes.length === 1 ? "note" : "notes"} so far`} onClose={onClose}>
      {newestFirst.length === 0 ? (
        <p className="text-sm text-muted">
          After each answer, the recruiter writes down what they noticed and why they ask what they ask next.
        </p>
      ) : (
        <Pages
          page={at}
          count={newestFirst.length}
          onTurn={setPage}
          label="Notepad"
          axis="up"
          pageLabel={(i) => `Q${newestFirst[i].seq}`}
        >
          <div className="max-h-[52vh] overflow-y-auto pr-1">
            <NotepadEntry note={newestFirst[at]} headingLevel="h3" />
          </div>
        </Pages>
      )}
    </HeldPad>
  );
}
