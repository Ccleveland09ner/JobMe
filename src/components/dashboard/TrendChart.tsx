"use client";

/**
 * Score trend across completed interviews, oldest to newest.
 * Ref: docs/PRD-JobMe-MVP.md > Dashboard and Progress
 *
 * Hand-rolled SVG rather than a chart library: one series at a time, chosen
 * with a radio group, is clearer than eight overlapping lines and costs no
 * dependency. Values are the backend's `overall_scores`; nothing is
 * recomputed here except the headline "Average" series (see displayAverage).
 *
 * Accessibility: the SVG is a labelled image with per-point <title>s, and a
 * visually hidden table carries every value for screen-reader users.
 *
 * Needs >= 2 completed sessions; below that a placeholder.
 */

import { useId, useState } from "react";

import { LocalDate } from "@/components/common/LocalDate";
import { Card } from "@/components/ui/Card";
import { DIMENSIONS, type Dimension, type Scores } from "@/lib/engine/types";
import { displayAverage } from "@/lib/frontend/adapters";
import { DIMENSION_LABELS } from "@/lib/frontend/labels";

export interface TrendPoint {
  id: string;
  startedAt: string;
  scores: Partial<Scores> | null;
}

type Series = "average" | Dimension;

const W = 640;
const H = 240;
const PAD = { left: 36, right: 16, top: 16, bottom: 36 };
const MIN = 1;
const MAX = 4;

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [series, setSeries] = useState<Series>("average");
  const groupName = useId();

  return (
    <Card as="section" aria-labelledby="trend-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="trend-title" className="text-base font-semibold text-ink">
          Score trends
        </h2>
        <p className="text-sm text-muted">Completed interviews, oldest to newest. Scores run 1–4.</p>
      </div>

      {points.length < 2 ? (
        <p className="rounded-lg bg-sunken px-4 py-10 text-center text-sm text-muted">
          Complete 2 interviews to see trends.
        </p>
      ) : (
        <>
          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="sr-only">Score to chart</legend>
            {(["average", ...DIMENSIONS] as Series[]).map((s) => (
              <label
                key={s}
                className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs text-ink has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent-strong has-focus-visible:outline-2 has-focus-visible:outline-accent"
              >
                <input
                  type="radio"
                  name={groupName}
                  value={s}
                  checked={series === s}
                  onChange={() => setSeries(s)}
                  className="sr-only"
                />
                {seriesLabel(s)}
              </label>
            ))}
          </fieldset>
          <Chart points={points} series={series} />
          <DataTable points={points} />
        </>
      )}
    </Card>
  );
}

function seriesLabel(s: Series): string {
  return s === "average" ? "Average" : DIMENSION_LABELS[s];
}

function valueOf(scores: Partial<Scores> | null, s: Series): number | null {
  if (!scores) return null;
  return s === "average" ? displayAverage(scores) : (scores[s] ?? null);
}

function Chart({ points, series }: { points: TrendPoint[]; series: Series }) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const y = (v: number) => PAD.top + ((MAX - v) / (MAX - MIN)) * innerH;

  const values = points.map((p) => valueOf(p.scores, series));

  // Break the line where a session has no value for this series.
  let d = "";
  let penDown = false;
  values.forEach((v, i) => {
    if (v === null) {
      penDown = false;
      return;
    }
    d += `${penDown ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    penDown = true;
  });

  const shown = values.filter((v): v is number => v !== null);
  const summary = shown.length
    ? `${seriesLabel(series)} across ${points.length} interviews: from ${shown[0]} to ${shown.at(-1)} out of 4.`
    : `No ${seriesLabel(series)} scores recorded yet.`;

  // Label every point when few, otherwise roughly six evenly spaced.
  const step = Math.max(1, Math.ceil(points.length / 6));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full">
      {[1, 2, 3, 4].map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line" strokeWidth={1} />
          <text x={PAD.left - 10} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[11px]">
            {v}
          </text>
        </g>
      ))}
      {points.map((p, i) =>
        i % step === 0 || i === points.length - 1 ? (
          <text key={p.id} x={x(i)} y={H - 12} textAnchor="middle" className="fill-muted text-[11px]">
            #{i + 1}
          </text>
        ) : null,
      )}
      <path d={d} fill="none" className="stroke-accent" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) =>
        v === null ? null : (
          <circle key={points[i].id} cx={x(i)} cy={y(v)} r={4} className="fill-surface stroke-accent" strokeWidth={2}>
            <title>{`Interview #${i + 1}: ${seriesLabel(series)} ${v} / 4`}</title>
          </circle>
        ),
      )}
    </svg>
  );
}

function DataTable({ points }: { points: TrendPoint[] }) {
  return (
    <table className="sr-only">
      <caption>Scores per completed interview, oldest first</caption>
      <thead>
        <tr>
          <th scope="col">Interview</th>
          <th scope="col">Average</th>
          {DIMENSIONS.map((d) => (
            <th key={d} scope="col">
              {DIMENSION_LABELS[d]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {points.map((p, i) => (
          <tr key={p.id}>
            <th scope="row">
              #{i + 1}, <LocalDate iso={p.startedAt} />
            </th>
            <td>{valueOf(p.scores, "average") ?? "—"}</td>
            {DIMENSIONS.map((d) => (
              <td key={d}>{p.scores?.[d] ?? "—"}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
