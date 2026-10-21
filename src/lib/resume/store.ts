/**
 * Persists an ingested resume and its chunk embeddings under RLS. The PDF is
 * never stored: only redacted text, distilled facts and vectors.
 */

import { createClient } from "@/lib/supabase/server";

import type { ResumeItem } from "@/lib/engine/types";
import type { RoleProfile } from "@/lib/jd/distill";

import type { Chunk } from "./chunk";
import type { RedactionResult } from "./redact";
import type { ParsedResume } from "./parse";

export interface StoredResume {
  id: string;
  chunkCount: number;
  layoutSuspect: boolean;
}

export interface ResumeFacts {
  roles?: { title?: string; employer?: string; period?: string }[];
  projects?: string[];
  metrics?: string[];
  skills?: string[];
}

export class ResumeStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeStoreError";
  }
}

/** Inserts the resume and its chunks (one batch, so a failure can't leave half the vectors). */
export async function storeResume(args: {
  parsed: ParsedResume;
  redaction: RedactionResult;
  chunks: Chunk[];
  vectors: number[][];
  facts: ResumeFacts | null;
  /** Distilled target role, when a job description was pasted. */
  role?: RoleProfile | null;
  /** Coverage list, already ranked. Seeds `EngineState.resumeItems`. */
  items?: ResumeItem[];
}): Promise<StoredResume> {
  const { parsed, redaction, chunks, vectors, facts, role, items } = args;

  if (chunks.length !== vectors.length) {
    throw new ResumeStoreError(
      `Refusing to store ${chunks.length} chunks with ${vectors.length} vectors.`,
    );
  }

  const supabase = await createClient();

  const { data: resume, error: resumeError } = await supabase
    .from("resumes")
    .insert({
      redacted_text: redaction.text,
      resume_facts: facts,
      parse_method: parsed.method,
      layout_suspect: parsed.layoutSuspect,
      page_count: parsed.pageCount,
      redaction_report: redaction.removed,
      role_profile: role ?? null,
      coverage_items: items ?? [],
    })
    .select("id")
    .single();

  if (resumeError || !resume) {
    throw new ResumeStoreError(
      `Could not save the resume: ${resumeError?.message ?? "no row returned"}`,
    );
  }

  const { error: chunkError } = await supabase.from("resume_chunks").insert(
    chunks.map((chunk, i) => ({
      resume_id: resume.id,
      seq: chunk.index,
      section: chunk.section,
      content: chunk.content,
      embedding: vectors[i] as unknown as string,
    })),
  );

  if (chunkError) {
    // Roll back by hand, so no resume survives without its chunks.
    await supabase.from("resumes").delete().eq("id", resume.id);
    throw new ResumeStoreError(
      `Could not save resume chunks: ${chunkError.message}`,
    );
  }

  return {
    id: resume.id,
    chunkCount: chunks.length,
    layoutSuspect: parsed.layoutSuspect,
  };
}

/** The current resume for the signed-in user, or null. */
export async function getLatestResume(): Promise<{
  id: string;
  facts: ResumeFacts | null;
  layoutSuspect: boolean;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resumes")
    .select("id, resume_facts, layout_suspect")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    facts: data.resume_facts as ResumeFacts | null,
    layoutSuspect: data.layout_suspect,
  };
}

/** Deletes a resume and, by cascade, its chunks. */
export async function deleteResume(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("resumes").delete().eq("id", id);
  if (error) throw new ResumeStoreError(error.message);
}
