/**
 * First-use dashboard state.
 * Ref: docs/PRD-JobMe-MVP.md > States and Boundaries
 */

import Link from "next/link";

import { EmptyState as CommonEmptyState } from "@/components/common/EmptyState";
import { buttonClasses } from "@/components/ui/Button";

export function EmptyState() {
  return (
    <CommonEmptyState
      title="No interviews yet"
      message="Your first interview takes about 8 minutes. You'll see what the recruiter noticed after every answer."
      action={
        <Link href="/interview/new" className={buttonClasses()}>
          Start interview
        </Link>
      }
    />
  );
}
