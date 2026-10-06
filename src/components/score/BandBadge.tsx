/**
 * The band the backend assigned. Displayed, never derived here.
 */

import type { Band } from "@/lib/engine/types";
import { BAND_LABELS } from "@/lib/frontend/labels";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const TONE: Record<Band, BadgeTone> = {
  weak: "score-1",
  mediocre: "score-3",
  great: "score-4",
};

export function BandBadge({ band }: { band: Band }) {
  return <Badge tone={TONE[band]}>{BAND_LABELS[band]}</Badge>;
}
