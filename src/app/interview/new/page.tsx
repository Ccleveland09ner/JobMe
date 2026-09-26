/**
 * Interview setup - confirm name, optional role/JD, check the mic. Under 30s.
 *
 * TODO(slice 2): server shell + SetupForm. TODO(slice 3): live mic check.
 * Ref: docs/PRD-JobMe-MVP.md > Interview Setup
 *      docs/TechDesign-JobMe-MVP.md > Components > Interview Setup
 *
 * Server shell wraps <SetupForm> (client), which contains <MicCheck> and the
 * speech-support probe. No support or no permission -> inputMode = 'typed',
 * passed to the room as a query param.
 *
 * The track is fixed: Behavioral, SWE internship. Render it as a label, NOT a
 * dropdown with one option - the PRD is explicit about no dead controls.
 *
 * Privacy line belongs here: "Your voice is transcribed by your browser; we
 * store text, never audio."
 */

export default function NewInterviewPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        Before we start
      </h1>
      {/* TODO(slice 2): <SetupForm /> */}
    </main>
  );
}
