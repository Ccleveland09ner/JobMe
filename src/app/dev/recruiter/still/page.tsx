/**
 * Development only: the recruiter alone at 480x400 on the card colour, for
 * capturing public/models/recruiter-still.png (see design/tools/README.md).
 * 404 in production.
 */

import { notFound } from "next/navigation";

import { RecruiterStage } from "@/components/room/RecruiterStage";

export default function RecruiterStillPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="fixed inset-0 bg-surface [&_figcaption]:hidden">
      {/* Keep the dev-mode badge out of the capture. */}
      <style>{"nextjs-portal{display:none}"}</style>
      <RecruiterStage state="idle" className="w-[480px]" />
    </main>
  );
}
