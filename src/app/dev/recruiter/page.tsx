/** Dev only: preview the recruiter (?state=speaking|idle|listening|thinking). 404 in production. */

import { notFound } from "next/navigation";

import type { AvatarProps } from "@/components/room/Avatar";

import { RecruiterPreview } from "./preview";

const STATES = new Set(["speaking", "idle", "listening", "thinking"]);

export default async function RecruiterPreviewPage({ searchParams }: PageProps<"/dev/recruiter">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  const initial = (typeof state === "string" && STATES.has(state) ? state : "speaking") as AvatarProps["state"];

  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Recruiter preview</h1>
        <p className="text-sm text-muted">Development only. Switch states to review the motion.</p>
      </div>
      <RecruiterPreview initial={initial} />
    </main>
  );
}
