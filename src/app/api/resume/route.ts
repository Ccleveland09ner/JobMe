/**
 * POST /api/resume: guard -> parse -> redact -> chunk -> embed + distill ->
 * store. Redaction runs before anything leaves this server. A route handler,
 * not a server action (actions cap bodies at 1 MB).
 */

import { NextResponse } from "next/server";

import { embedMany } from "@/lib/ai/embeddings";
import { getUserOrNull, UNAUTHORIZED } from "@/lib/auth";
import { MAX_JD_CHARS, distillJobDescription } from "@/lib/jd/distill";
import { chunkResume } from "@/lib/resume/chunk";
import { distillResume } from "@/lib/resume/distill";
import { buildResumeItems, rankItemsAgainstRole } from "@/lib/resume/items";
import { ResumeParseError, parseResumePdf } from "@/lib/resume/parse";
import { redact } from "@/lib/resume/redact";
import { ResumeStoreError, storeResume } from "@/lib/resume/store";

/** Below the 6MB proxy cap. A text resume is tens of KB. */
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getUserOrNull();
  if (!user) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  // Reject on the declared size BEFORE reading the body.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return NextResponse.json(
      { error: `Resume must be under ${MAX_BYTES / 1024 / 1024}MB.` },
      { status: 413 },
    );
  }

  /**
   * Truncation guard: proxyClientMaxBodySize lets an oversized body through
   * truncated, so compare content-length with the whole body received (the
   * multipart envelope, not just the file). Cloned, as a body reads once.
   */
  let received: number;
  try {
    received = (await request.clone().arrayBuffer()).byteLength;
  } catch {
    return NextResponse.json(
      { error: "Could not read the upload." },
      { status: 400 },
    );
  }

  if (declared > 0 && received < declared) {
    return NextResponse.json(
      {
        error:
          "The upload was truncated in transit. Try a smaller file, or " +
          "re-export the PDF.",
      },
      { status: 413 },
    );
  }

  let file: File | null = null;
  let form: FormData | null = null;
  try {
    form = await request.formData();
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

  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: `Resume must be under ${MAX_BYTES / 1024 / 1024}MB.` },
      { status: 413 },
    );
  }

  // Parse.
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

  // Redact, before anything leaves this server.
  const redaction = redact(parsed.text);

  const chunks = chunkResume(redaction.text);
  if (!chunks.length) {
    return NextResponse.json(
      { error: "That resume produced no readable sections." },
      { status: 422 },
    );
  }

  /** Reorders coverage by relevance; every role and project is still covered. */
  const jdText = String(form?.get("roleText") ?? "").slice(0, MAX_JD_CHARS);

  // Embed and distill, in parallel.
  let vectors: number[][];
  let facts;
  let role;
  try {
    [vectors, facts, role] = await Promise.all([
      embedMany(
        chunks.map((c) => c.content),
        "RETRIEVAL_DOCUMENT",
      ),
      distillResume(redaction.text),
      jdText ? distillJobDescription(jdText) : Promise.resolve(null),
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

  // Reuses the chunk vectors: one extra embedding call, for the role query.
  const items = await rankItemsAgainstRole(
    buildResumeItems(facts, chunks),
    chunks,
    role,
  );

  // Store.
  try {
    const stored = await storeResume({
      parsed,
      redaction,
      chunks,
      vectors,
      facts,
      role,
      items,
    });

    return NextResponse.json({
      resumeId: stored.id,
      chunkCount: stored.chunkCount,
      pageCount: parsed.pageCount,
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
      hasFacts: facts !== null,
    });
  } catch (err) {
    if (err instanceof ResumeStoreError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    throw err;
  }
}
