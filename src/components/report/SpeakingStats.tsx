/**
 * Words per minute and filler count, overall and per answer.
 * Ref: docs/PRD-JobMe-MVP.md > Scorecard
 *
 * All figures come from the server: the overall ones from the report's
 * `stats` (WPM over total CAPTURE time), the per-answer ones from each turn
 * row. Computed in code there, so this section renders even when every AI
 * call failed. Typed answers have no capture time, so WPM shows as "—"
 * rather than a made-up rate.
 *
 * The filler count is labelled "approximate" - Chrome's STT drops most um/uh
 * before the server sees the text.
 */

import { Card } from "@/components/ui/Card";
import type { ReportTurnView } from "@/lib/frontend/types";

export function SpeakingStats({
  wpm,
  fillers,
  turns,
}: {
  wpm: number | null;
  fillers: number | null;
  turns: ReportTurnView[];
}) {
  const anyTimed = turns.some((t) => t.wpm !== null && t.wpm > 0);

  return (
    <Card as="section" aria-labelledby="stats-title" className="flex flex-col gap-4">
      <h2 id="stats-title" className="text-base font-semibold text-ink">
        Speaking
      </h2>
      <dl className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted">Words per minute</dt>
          <dd className="text-xl font-semibold tabular-nums text-ink">{wpm ?? "—"}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-xs text-muted">Filler words (approximate)</dt>
          <dd className="text-xl font-semibold tabular-nums text-ink">{fillers ?? "—"}</dd>
        </div>
      </dl>
      {!anyTimed && (
        <p className="text-xs text-muted">Words per minute is measured on spoken answers only.</p>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-ink">Per answer</summary>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th scope="col" className="py-1 font-medium">
                Question
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                WPM
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Fillers (approx.)
              </th>
            </tr>
          </thead>
          <tbody>
            {turns.map((t) => (
              <tr key={t.id} className="border-t border-line">
                <th scope="row" className="py-1 text-left font-normal">
                  Q{t.seq}
                </th>
                <td className="py-1 text-right tabular-nums">{t.wpm && t.wpm > 0 ? t.wpm : "—"}</td>
                <td className="py-1 text-right tabular-nums">{t.fillers ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
}
