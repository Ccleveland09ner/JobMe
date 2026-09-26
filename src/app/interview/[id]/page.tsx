/**
 * The interview room. Server Component that hydrates the client orchestrator.
 *
 * TODO(slice 2): load session + turns, pass to <InterviewRoom>.
 * Ref: docs/PRD-JobMe-MVP.md > Interview Room: Voice Loop
 *      docs/TechDesign-JobMe-MVP.md > The Core Journey (4)
 *
 * Loads the session and its turns server-side. If status = 'completed',
 * redirect to ./report. Otherwise hand <InterviewRoom> the current question
 * and the notepad history.
 *
 * Passing that history down from the server is what makes refresh-resume free -
 * there is no client-side rehydration logic to write.
 */

export default async function InterviewRoomPage({
  params,
}: PageProps<"/interview/[id]">) {
  const { id } = await params;

  return (
    <main className="flex flex-1 flex-col px-6 py-6">
      <h1 className="sr-only">Interview in progress</h1>
      <p className="text-sm text-muted">Session {id}</p>
      {/* TODO(slice 2): <InterviewRoom session={...} turns={...} /> */}
    </main>
  );
}
