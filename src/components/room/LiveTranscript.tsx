/**
 * The answer as it is being recognised.
 *
 * TODO(slice 3): implement.
 * Ref: docs/TechDesign-JobMe-MVP.md > Components > Interview Room
 *
 * Interim results render grey, finals render in ink. Showing this before submit
 * is the mitigation for STT mishearing - the candidate can Re-record.
 */

export function LiveTranscript({
  interim,
  final,
}: {
  interim: string;
  final: string;
}) {
  void interim;
  void final;
  return <div className="min-h-24 rounded-lg border border-muted/20 p-3" />;
}
