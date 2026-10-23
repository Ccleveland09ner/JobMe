/** How the report's blocks name its sections, questions and follow-ups. */

import { MOVE_LABELS } from "@/lib/frontend/labels";
import type { FolderSection, ReportQuestion, ReportTurn } from "@/lib/frontend/report-document";

/** Each section's heading, which the flap's contents send focus to. */
export const sectionHeadingId = (id: FolderSection) => `report-${id}`;

/** "Q2 · Influencing others": how the feedback cites a question. */
export const questionName = (q: ReportQuestion) => `${q.ref} · ${q.label}`;

/** "Clarify follow-up". */
export const followUpName = (turn: ReportTurn) => (turn.questionType ? `${MOVE_LABELS[turn.questionType]} follow-up` : "Follow-up");
