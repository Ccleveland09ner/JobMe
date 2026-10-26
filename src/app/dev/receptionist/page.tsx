/**
 * Dev only: Ms. Crystal from several sides beside the interviewer, and every
 * line she says (?view=row|close|high&turn=<radians>). 404 in production.
 */

import { notFound } from "next/navigation";

import { linesOf, type LineKind } from "@/components/receptionist/lines";

import { ReceptionistPreview } from "./preview";

const HEADINGS: Record<LineKind, string> = {
  new: "Greetings: a first visit",
  returning: "Greetings: a return",
  goodbye: "Goodbyes: signing out",
};

export default async function ReceptionistPreviewPage({ searchParams }: PageProps<"/dev/receptionist">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view, turn } = await searchParams;
  const close = view === "close" || view === "high";
  const angle = typeof turn === "string" && Number.isFinite(Number(turn)) ? Number(turn) : 0;

  return (
    <main id="main" className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Receptionist preview</h1>
        <p className="text-sm text-muted">
          Development only. Ms. Crystal from the front, three-quarter, side and back, then the interviewer, unchanged.
        </p>
      </div>
      <ReceptionistPreview close={close} high={view === "high"} turn={angle} />
      {(["new", "returning", "goodbye"] as const).map((kind) => (
        <section key={kind} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{HEADINGS[kind]}</h2>
          <ul className="flex flex-col gap-3">
            {linesOf(kind).map((line) => (
              <li key={line.id} className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:items-center sm:gap-4">
                <p className="flex-1 text-sm text-ink">{line.text}</p>
                <audio controls preload="none" src={line.src} className="h-9 w-full sm:w-72" aria-label={`Play: ${line.text}`} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
