/**
 * POST /api/resume: the upload checks, then lib/resume/ingest.ts (parse ->
 * redact -> chunk -> embed + distill -> rank -> store). A route handler, not
 * a server action (actions cap bodies at 1 MB).
 */

import { NextResponse } from "next/server";

import { getUserOrNull } from "@/lib/auth";
import { FREE_TIER_RPM } from "@/lib/ai/llm";
import type { ResumeUploadResponse } from "@/lib/frontend/types";
import { serverError, unauthorized, unavailable, unprocessable } from "@/lib/http";
import { ingestResume } from "@/lib/resume/ingest";
import { storeResume } from "@/lib/resume/store";
import { createClient } from "@/lib/supabase/server";

/** A text resume is tens of KB. */
const MAX_BYTES = 4 * 1024 * 1024;

const tooLarge = () => NextResponse.json({ error: `Resume must be under ${MAX_BYTES / 1024 / 1024}MB.` }, { status: 413 });
const unreadableUpload = () => NextResponse.json({ error: "Could not read the upload." }, { status: 400 });

export async function POST(request: Request) {
  if (!(await getUserOrNull())) return unauthorized();

  // Reject on the declared size BEFORE reading the body.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return tooLarge();

  // Read once, then parse the form from the same bytes.
  let raw: ArrayBuffer;
  try {
    raw = await request.arrayBuffer();
  } catch {
    return unreadableUpload();
  }

  /**
   * Truncation guard: content-length against the whole body received (the
   * multipart envelope, not just the file). Next buffers, and past
   * proxyClientMaxBodySize silently truncates, a body it hands to the proxy;
   * the proxy skips api/ today, so this only catches a cut further upstream.
   */
  if (declared > 0 && raw.byteLength < declared) {
    return NextResponse.json(
      { error: "The upload was truncated in transit. Try a smaller file, or re-export the PDF." },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await new Response(raw, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch {
    return unreadableUpload();
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return unprocessable({ error: "No file was uploaded." });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) return tooLarge();

  const outcome = await ingestResume(bytes, String(form.get("roleText") ?? ""), async (args) =>
    storeResume(await createClient(), args),
  );

  switch (outcome.kind) {
    case "unreadable":
      return unprocessable({ error: outcome.error.message, code: outcome.error.code });
    case "empty":
      return unprocessable({ error: "That resume produced no readable sections." });
    case "ai-unavailable":
      return unavailable({
        error: `Could not process the resume right now. The free AI tier allows ${FREE_TIER_RPM} requests a minute — wait a moment and try again.`,
        detail: outcome.reason,
      });
    case "store-failed":
      return serverError(`[resume] store: ${outcome.reason}`, "Couldn't save your resume. Please try again.");
  }

  const { stored, items, role, redaction } = outcome;
  return NextResponse.json({
    resumeId: stored.id,
    chunkCount: stored.chunkCount,
    pageCount: outcome.pageCount,
    /** What the interview will work through, in ask order. */
    coverage: items.map((i) => ({
      id: i.id,
      kind: i.kind,
      label: i.label,
      relevance: Number(i.relevanceToRole.toFixed(3)),
    })),
    role: role ? { title: role.title, seniority: role.seniority } : null,
    /** When set, the client must confirm the extracted text (some layouts parse into nonsense). */
    layoutSuspect: stored.layoutSuspect,
    extractedPreview: redaction.text.slice(0, 600),
    /** Diagnostics so the user can see redaction actually happened. */
    redacted: redaction.removed,
    hasFacts: outcome.hasFacts,
  } satisfies ResumeUploadResponse);
}
