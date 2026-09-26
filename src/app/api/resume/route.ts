/**
 * POST /api/resume — ingest a resume PDF.
 *
 * Ref: docs/TechDesign-JobMe-MVP.md > Security
 *
 * A Route Handler rather than a Server Action, deliberately: Server Actions
 * cap request bodies at 1MB by default and dispatch one-at-a-time per client,
 * while a Route Handler has no documented body cap.
 *
 * Pipeline: guard -> parse -> redact -> chunk -> embed + distill -> store.
 * Redaction runs before anything leaves this server.
 */

import { NextResponse } from "next/server";

import { embedMany } from "@/lib/ai/embeddings";
import { getUserOrNull, UNAUTHORIZED } from "@/lib/auth";
import { chunkResume } from "@/lib/resume/chunk";
import { distillResume } from "@/lib/resume/distill";
import { ResumeParseError, parseResumePdf } from "@/lib/resume/parse";
import { redact } from "@/lib/resume/redact";
import { ResumeStoreError, storeResume } from "@/lib/resume/store";

/**
 * Our own ceiling, below `experimental.proxyClientMaxBodySize` (6MB) in
 * next.config.ts. A text resume is tens of KB; 4MB is generous for one with
 * embedded images.
 */
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getUserOrNull();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  /**
   * Reject on the declared size BEFORE reading the body, so an oversized
   * upload costs us nothing.
   */
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return NextResponse.json(
      { error: `Resume must be under ${MAX_BYTES / 1024 / 1024}MB.` },
      { status: 413 },
    );
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json(
      { error: "Could not read the upload." },
      { status: 400 },
    );
  }

  if (!file) {
    return NextResponse.json(
      { error: "No file was uploaded." },
      { status: 422 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  /**
   * THE SILENT-TRUNCATION GUARD.
   *
   * `proxyClientMaxBodySize` does not reject an oversized body — it buffers up
   * to the limit, logs a warning, and lets the request through TRUNCATED. A
   * half-read PDF would parse into partial text, embed cleanly, and produce a
   * resume that is quietly missing its most recent role. Comparing the
   * declared length against what actually arrived is the only way to notice.
   */
  if (declared > 0 && bytes.byteLength < declared) {
    return NextResponse.json(
      {
        error:
          "The upload was truncated in transit. Try a smaller file, or " +
          "re-export the PDF.",
      },
      { status: 413 },
    );
  }

  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: `Resume must be under ${MAX_BYTES / 1024 / 1024}MB.` },
      { status: 413 },
    );
  }

  // ---- parse -------------------------------------------------------------
  let parsed;
  try {
    parsed = await parseResumePdf(bytes);
  } catch (err) {
    if (err instanceof ResumeParseError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 422 },
      );
    }
    throw err;
  }

  // ---- redact, before anything leaves this server -------------------------
  const redaction = redact(parsed.text);

  const chunks = chunkResume(redaction.text);
  if (!chunks.length) {
    return NextResponse.json(
      { error: "That resume produced no readable sections." },
      { status: 422 },
    );
  }

  // ---- embed and distill, in parallel ------------------------------------
  let vectors: number[][];
  let facts;
  try {
    [vectors, facts] = await Promise.all([
      embedMany(
        chunks.map((c) => c.content),
        "RETRIEVAL_DOCUMENT",
      ),
      distillResume(redaction.text),
    ]);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Could not process the resume right now. The free AI tier allows " +
          "15 requests a minute — wait a moment and try again.",
        detail: (err as Error).message.slice(0, 200),
      },
      { status: 503 },
    );
  }

  // ---- store -------------------------------------------------------------
  try {
    const stored = await storeResume({
      parsed,
      redaction,
      chunks,
      vectors,
      facts,
    });

    return NextResponse.json({
      resumeId: stored.id,
      chunkCount: stored.chunkCount,
      pageCount: parsed.pageCount,
      /**
       * The client must show the extracted text for confirmation when this is
       * set — a flattened two-column layout parses into plausible-looking
       * nonsense, and only the candidate can tell.
       */
      layoutSuspect: stored.layoutSuspect,
      extractedPreview: redaction.text.slice(0, 600),
      /** Diagnostics so the user can see redaction actually happened. */
      redacted: redaction.removed,
      hasFacts: facts !== null,
    });
  } catch (err) {
    if (err instanceof ResumeStoreError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }
}
