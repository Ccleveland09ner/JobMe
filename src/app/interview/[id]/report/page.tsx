/**
 * Scorecard. Server Component.
 *
 * TODO(slice 5): implement.
 * Ref: docs/PRD-JobMe-MVP.md > Scorecard
 *      docs/TechDesign-JobMe-MVP.md > Scorecard Page
 *
 * Loads session, turns and report. If no report row exists yet, the client
 * triggers POST /api/sessions/[id]/report once, then renders.
 *
 * Sections: summary, <ScoreTable>, <HighlightedTranscript>, <SpeakingStats>,
 * <RewriteCard>, Back to dashboard.
 *
 * Scores are practice feedback, never framed as a prediction of a hiring
 * outcome. Ref: docs/PRD-JobMe-MVP.md > Non-Goals
 */

export default async function ReportPage({
  params,
}: PageProps<"/interview/[id]/report">) {
  const { id } = await params;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Your scorecard
      </h1>
      <p className="text-sm text-muted">Session {id}</p>
      {/* TODO(slice 5): summary, score table, transcript, stats, rewrite */}
    </main>
  );
}
