/**
 * Dev only: the page-turning component on its own (the integration's demo).
 * Neutral sample pages, in the three modes. 404 in production.
 */

import { notFound } from "next/navigation";

import { BookDemo } from "./demo";

export default function BookDemoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main id="main" className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Book slider</h1>
        <p className="text-sm text-muted">Development only. Drag a corner, click a corner, or use the arrows.</p>
      </div>
      <BookDemo />
    </main>
  );
}
