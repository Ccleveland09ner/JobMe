/**
 * "Topic 2 of 4 - Q5".
 *
 * TODO(slice 4): implement.
 * Ref: docs/PRD-JobMe-MVP.md > Screens and Layout (5)
 *
 * Sessions run 4-10 questions across 4 topics and stop hard at 10, so this is
 * also the candidate's sense of how much is left.
 */

export function ProgressPill({
  topicIndex,
  topicsTotal,
  questionCount,
}: {
  topicIndex: number;
  topicsTotal: number;
  questionCount: number;
}) {
  void topicIndex;
  void topicsTotal;
  void questionCount;
  return <span className="text-xs text-muted">{/* TODO(slice 4) */}</span>;
}
