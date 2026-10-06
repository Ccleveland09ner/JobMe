import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RoleProfile } from "@/lib/jd/distill";
import type { ResumeItem } from "@/lib/engine/types";

import type { Chunk } from "./chunk";

/**
 * A deterministic stand-in for the embedder: each text becomes a vector of
 * keyword counts, so cosine means something real and the test discriminates
 * on content rather than on a hash.
 */
const MARKERS = [
  "python", "sql", "postgres", "api", "react", "docker",
  "kubernetes", "pipeline", "data", "frontend",
];

function fakeEmbed(text: string): number[] {
  const lower = text.toLowerCase();
  const v = MARKERS.map((m) => (lower.split(m).length - 1));
  // Keep a floor so an all-zero document still has a defined cosine.
  return v.some((n) => n > 0) ? v : MARKERS.map(() => 0.01);
}

vi.mock("@/lib/ai/embeddings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/embeddings")>();
  return {
    ...actual,
    embedMany: vi.fn(async (texts: string[]) => texts.map(fakeEmbed)),
  };
});

const { rankItemsAgainstRole, tokenize, lexicalOverlap, itemDocument } =
  await import("./items");
const { embedMany } = await import("@/lib/ai/embeddings");

const ROLE: RoleProfile = {
  title: "Backend Engineer",
  seniority: "intern",
  requiredSkills: ["Python", "SQL", "Postgres", "API"],
  responsibilities: ["Build REST API endpoints", "Write SQL against Postgres"],
  competencies: ["ownership"],
};

function item(id: string, over: Partial<ResumeItem> = {}): ResumeItem {
  return {
    id,
    kind: "project",
    label: id,
    chunkSeqs: [0],
    relevanceToRole: 0,
    covered: false,
    ...over,
  };
}

/** One shared chunk — the exact situation that flattened the old scores. */
const SHARED: Chunk[] = [
  {
    index: 0,
    section: "PROJECTS",
    content: "Various projects using python sql react docker",
    estimatedTokens: 10,
  },
];

beforeEach(() => {
  vi.mocked(embedMany).mockClear();
});

describe("tokenize", () => {
  it("keeps technology names, including ones with punctuation", () => {
    const t = tokenize("Python, SQL and Node.js with C++");
    expect(t.has("python")).toBe(true);
    expect(t.has("sql")).toBe(true);
    expect(t.has("node.js")).toBe(true);
  });

  it("drops stopwords and very short tokens", () => {
    const t = tokenize("and the work experience with a team");
    expect(t.has("and")).toBe(false);
    expect(t.has("team")).toBe(false);
    expect(t.has("a")).toBe(false);
  });
});

describe("lexicalOverlap", () => {
  const role = tokenize("python sql postgres docker");

  it("measures the share of the posting the item evidences", () => {
    expect(lexicalOverlap(role, "built a python service on postgres")).toBeCloseTo(0.5);
  });

  it("does not penalise an item for extra content", () => {
    const short = lexicalOverlap(role, "python sql postgres docker");
    const long = lexicalOverlap(
      role,
      "python sql postgres docker plus a great deal of unrelated prose here",
    );
    expect(long).toBe(short);
  });

  it("is zero when the posting asks for nothing", () => {
    expect(lexicalOverlap(new Set(), "python")).toBe(0);
  });
});

describe("itemDocument", () => {
  it("combines the label, employer and backing chunk text", () => {
    const doc = itemDocument(
      item("a", { label: "Data Engineer", employer: "Acme", chunkSeqs: [0] }),
      SHARED,
    );
    expect(doc).toContain("Data Engineer");
    expect(doc).toContain("Acme");
    expect(doc).toContain("python sql");
  });

  it("falls back to the label when no chunk backs the item", () => {
    expect(itemDocument(item("solo", { chunkSeqs: [] }), SHARED)).toBe("solo");
  });
});

describe("rankItemsAgainstRole", () => {
  /**
   * THE regression. Six items over one shared chunk previously all scored
   * identically, because the score was the max cosine over chunks they had in
   * common. Each item is now embedded as its own document.
   */
  it("discriminates between items that share a chunk", async () => {
    const items = [
      item("python-etl", { label: "Python ETL pipeline writing SQL to postgres" }),
      item("react-ui", { label: "React frontend UI" }),
      item("docker-infra", { label: "Docker and kubernetes infra" }),
    ];

    const ranked = await rankItemsAgainstRole(items, SHARED, ROLE);
    const scores = ranked.map((r) => r.relevanceToRole);

    expect(new Set(scores).size).toBe(scores.length);
    // The backend-shaped item matches a backend posting.
    expect(ranked[0].id).toBe("python-etl");
  });

  it("is reproducible — the same input gives the same order and scores", async () => {
    const items = [
      item("a", { label: "python api" }),
      item("b", { label: "react frontend" }),
      item("c", { label: "sql postgres" }),
    ];
    const first = await rankItemsAgainstRole(items, SHARED, ROLE);
    const second = await rankItemsAgainstRole(items, SHARED, ROLE);
    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
    expect(second.map((r) => r.relevanceToRole)).toEqual(
      first.map((r) => r.relevanceToRole),
    );
  });

  it("ranks a role above a project when content is otherwise equal", async () => {
    const items = [
      item("proj", { kind: "project", label: "python sql" }),
      item("role", { kind: "role", label: "python sql" }),
    ];
    const ranked = await rankItemsAgainstRole(items, SHARED, ROLE);
    expect(ranked[0].id).toBe("role");
  });

  it("orders deterministically with no job description at all", async () => {
    const items = [
      item("p1", { kind: "project" }),
      item("r1", { kind: "role" }),
      item("p2", { kind: "project" }),
    ];
    const ranked = await rankItemsAgainstRole(items, SHARED, null);
    expect(ranked[0].id).toBe("r1");
    expect(ranked.map((r) => r.id)).toEqual(
      (await rankItemsAgainstRole(items, SHARED, null)).map((r) => r.id),
    );
    expect(embedMany).not.toHaveBeenCalled();
  });

  it("falls back to a stable order when embedding fails", async () => {
    vi.mocked(embedMany).mockRejectedValueOnce(new Error("rate limited"));
    const items = [item("a", { kind: "project" }), item("b", { kind: "role" })];
    const ranked = await rankItemsAgainstRole(items, SHARED, ROLE);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].id).toBe("b");
  });

  it("scores stay within 0..1 so they are comparable across resumes", async () => {
    const items = [item("a", { label: "python" }), item("b", { label: "react" })];
    for (const r of await rankItemsAgainstRole(items, SHARED, ROLE)) {
      expect(r.relevanceToRole).toBeGreaterThanOrEqual(0);
      expect(r.relevanceToRole).toBeLessThanOrEqual(1);
    }
  });

  it("embeds every item once, in a single batched call", async () => {
    const items = [item("a"), item("b"), item("c")];
    await rankItemsAgainstRole(items, SHARED, ROLE);
    expect(embedMany).toHaveBeenCalledTimes(1);
    const [texts] = vi.mocked(embedMany).mock.calls[0];
    // role query + 3 item documents + 1 chunk
    expect(texts).toHaveLength(5);
  });

  it("returns an empty list unchanged", async () => {
    expect(await rankItemsAgainstRole([], SHARED, ROLE)).toEqual([]);
  });
});
