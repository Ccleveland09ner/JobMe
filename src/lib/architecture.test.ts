/**
 * The dependency rules in docs/Architecture.md, checked on every test run.
 * Only value imports count: `import type` is erased before the bundler sees it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/** Server-only code, and the question bank (labels.ts keeps a copy so it never ships). */
const NEVER_IN_THE_BROWSER = [
  "lib/supabase/server.ts",
  "lib/auth.ts",
  "lib/ai/",
  "lib/resume/store.ts",
  "lib/engine/bank.ts",
];

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join("/");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [full] : [];
  });
}

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) ?? null;
}

const STATEMENT = /(?:^|\n)[ \t]*(?:import|export)\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']|(?:^|\n)[ \t]*import\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/** `import { type A, type B }` brings in nothing at runtime. */
const typeOnly = (clause: string) => {
  const named = clause.trim().match(/^\{([^}]*)\}$/);
  return Boolean(named) && named![1].split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "));
};

function valueImports(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of text.matchAll(STATEMENT)) {
    if (m[1] !== undefined && typeOnly(m[1])) continue;
    const target = resolve(file, m[2] ?? m[3] ?? m[4]);
    if (target) out.push(target);
  }
  return out;
}

const files = sourceFiles(SRC);
const graph = new Map(files.map((f) => [f, valueImports(f)]));
const isClient = (file: string) => /^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*["']use client["']/.test(fs.readFileSync(file, "utf8"));
/** A "use server" module reaches the browser only as references to its functions: its own imports stay on the server. */
const isServerFunctions = (file: string) => /^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*["']use server["']/.test(fs.readFileSync(file, "utf8"));

describe("architecture", () => {
  it("keeps server-only code and the question bank out of the browser", () => {
    const leaks: string[] = [];
    for (const client of files.filter(isClient)) {
      const seen = new Set<string>([client]);
      const stack: string[][] = [[client]];
      while (stack.length) {
        const trail = stack.pop()!;
        for (const next of graph.get(trail.at(-1)!) ?? []) {
          if (NEVER_IN_THE_BROWSER.some((p) => rel(next).startsWith(p))) {
            leaks.push([...trail, next].map(rel).join(" -> "));
          } else if (!seen.has(next)) {
            seen.add(next);
            if (!isServerFunctions(next)) stack.push([...trail, next]);
          }
        }
      }
    }
    expect(leaks).toEqual([]);
  });

  it("keeps lib free of components and app, and the engine free of everything else", () => {
    const wrong: string[] = [];
    for (const [file, targets] of graph) {
      const from = rel(file);
      for (const target of targets.map(rel)) {
        if (from.startsWith("lib/") && /^(components|app)\//.test(target)) wrong.push(`${from} -> ${target}`);
        if (from.startsWith("lib/engine/") && !target.startsWith("lib/engine/")) wrong.push(`${from} -> ${target}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("has no import cycles", () => {
    const cycles: string[] = [];
    const state = new Map<string, "open" | "done">();
    const visit = (file: string, trail: string[]) => {
      state.set(file, "open");
      for (const next of graph.get(file) ?? []) {
        if (state.get(next) === "open") cycles.push([...trail.slice(trail.indexOf(next)), next].map(rel).join(" -> "));
        else if (!state.has(next)) visit(next, [...trail, next]);
      }
      state.set(file, "done");
    };
    for (const file of files) if (!state.has(file)) visit(file, [file]);
    expect(cycles).toEqual([]);
  });

  it("finds the modules it is checking", () => {
    // Guards against a broken walk passing every rule by checking nothing.
    expect(files.length).toBeGreaterThan(100);
    expect(files.filter(isClient).length).toBeGreaterThan(30);
    expect(graph.get(path.join(SRC, "lib/frontend/report-document.ts"))?.length).toBeGreaterThan(3);
  });
});
