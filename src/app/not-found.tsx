import Link from "next/link";

import { EmptyState } from "@/components/common/EmptyState";
import { PageContainer } from "@/components/layout/PageContainer";
import { buttonClasses } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main id="main" className="flex flex-1 flex-col">
      <PageContainer width="narrow">
        <EmptyState
          headingLevel="h2"
          title="We couldn't find that page"
          message="It may have been deleted, or the link may be wrong."
          action={
            <Link href="/dashboard" className={buttonClasses()}>
              Go to your dashboard
            </Link>
          }
        />
      </PageContainer>
    </main>
  );
}
