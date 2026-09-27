/**
 * Reads a job posting from a link, so the interview can be tailored to it.
 *
 * ALLOWLIST ONLY. The candidate's link never decides which host we contact:
 * it is parsed into a known provider plus ids, and we call that provider's
 * PUBLIC posting API on a fixed host. There is no user-controlled fetch to aim
 * at an internal address, so SSRF is not a class of bug this module can have —
 * the design `src/lib/jd/distill.ts` asked for ("behind an allowlist with a
 * paste fallback").
 *
 * Supported: Greenhouse, Lever, Ashby and SmartRecruiters — the applicant
 * tracking systems behind most startup career pages — plus company-hosted
 * Greenhouse pages (`?gh_jid=`). Response shapes verified live 2026-09-26.
 *
 * Deliberately NOT supported: LinkedIn, Indeed, Handshake, Workday and
 * generic pages. They block server-side fetches or sit behind a login, and
 * scraping them breaks their terms. Those links raise `JobLinkError`, which
 * the route turns into "paste the description instead".
 */

export type JobProvider = "greenhouse" | "lever" | "ashby" | "smartrecruiters";

export interface JobPosting {
  provider: JobProvider;
  title: string;
  company: string | null;
  /** Plain text, whitespace-normalised, capped at MAX_POSTING_CHARS. */
  text: string;
}

export class JobLinkError extends Error {
  constructor(
    message: string,
    /** `unsupported`: not a site we read. `unreadable`: we tried and failed. */
    readonly code: "unsupported" | "unreadable",
  ) {
    super(message);
    this.name = "JobLinkError";
  }
}

export const FETCH_TIMEOUT_MS = 4000;
export const MAX_POSTING_CHARS = 8000;
const ONE_MB = 1024 * 1024;

/** Too short to be a real posting — probably an error page or a stub. */
const MIN_POSTING_CHARS = 80;

/** A path segment we are willing to place in an upstream URL. */
const SEGMENT = /^[A-Za-z0-9_-]{1,100}$/;

interface Target {
  provider: JobProvider;
  /** Always one of four fixed hosts; only ids come from the link. */
  api: string;
  /** Ashby only lists whole boards: the posting to pick out of it. */
  postingId?: string;
  maxBytes: number;
}

const unsupported = () =>
  new JobLinkError(
    "We can't read postings from that site. Paste the job description instead.",
    "unsupported",
  );

const unreadable = () =>
  new JobLinkError(
    "We couldn't read that job posting. Check the link, or paste the description instead.",
    "unreadable",
  );

/** Maps a pasted link onto a fixed provider API URL, or throws `unsupported`. */
export function resolveJobLink(raw: string): Target {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw unsupported();
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw unsupported();

  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);
  const seg = (i: number) =>
    parts[i] && SEGMENT.test(parts[i]) ? parts[i] : null;

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    // Embedded form: /embed/job_app?for={board}&token={id}
    const embed = parts[0] === "embed";
    const board = embed ? url.searchParams.get("for") : seg(0);
    const id = embed
      ? url.searchParams.get("token")
      : parts[1] === "jobs"
        ? seg(2)
        : null;
    if (board && SEGMENT.test(board) && id && /^\d+$/.test(id)) {
      return greenhouse(board, id);
    }
  }

  if (host === "jobs.lever.co" || host === "jobs.eu.lever.co") {
    const site = seg(0);
    const id = seg(1);
    if (site && id) {
      const api = host === "jobs.eu.lever.co" ? "api.eu.lever.co" : "api.lever.co";
      return {
        provider: "lever",
        api: `https://${api}/v0/postings/${site}/${id}`,
        maxBytes: ONE_MB,
      };
    }
  }

  if (host === "jobs.ashbyhq.com") {
    const org = seg(0);
    const id = seg(1);
    if (org && id) {
      return {
        provider: "ashby",
        api: `https://api.ashbyhq.com/posting-api/job-board/${org}`,
        postingId: id,
        // The only public endpoint returns the whole board (~30KB a job).
        maxBytes: 12 * ONE_MB,
      };
    }
  }

  if (host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") {
    const company = seg(0);
    const id = parts[1]?.match(/^(\d+)(?:-|$)/)?.[1];
    if (company && id) {
      return {
        provider: "smartrecruiters",
        api: `https://api.smartrecruiters.com/v1/companies/${company}/postings/${id}`,
        maxBytes: ONE_MB,
      };
    }
  }

  // A company careers page embedding Greenhouse, e.g.
  // careers.airbnb.com/positions/123?gh_jid=123. The board token is usually
  // the company's domain name. Only the fixed Greenhouse host is contacted,
  // so a wrong guess costs one 404, never a request somewhere else.
  const ghJid = url.searchParams.get("gh_jid");
  const board = ghJid && /^\d+$/.test(ghJid) ? boardTokenFromHost(host) : null;
  if (ghJid && board) return greenhouse(board, ghJid);

  throw unsupported();
}

function greenhouse(board: string, id: string): Target {
  return {
    provider: "greenhouse",
    api: `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`,
    maxBytes: ONE_MB,
  };
}

/** careers.airbnb.com -> airbnb; jobs.acme.co.uk -> acme. */
function boardTokenFromHost(host: string): string | null {
  const labels = host.split(".");
  if (labels.length < 2) return null;
  const secondLevel = new Set(["co", "com", "org", "net", "ac", "gov"]);
  let i = labels.length - 2;
  if (secondLevel.has(labels[i]) && i > 0) i--;
  const token = labels[i];
  return SEGMENT.test(token) ? token : null;
}

export async function fetchJobPosting(
  raw: string,
  fetcher: typeof fetch = fetch,
): Promise<JobPosting> {
  const target = resolveJobLink(raw);

  let res: Response;
  try {
    res = await fetcher(target.api, {
      // A redirect would be the one way to reach a host we did not choose.
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch {
    throw unreadable();
  }
  if (!res.ok) throw unreadable();

  let json: unknown;
  try {
    json = JSON.parse(await readCapped(res, target.maxBytes));
  } catch {
    throw unreadable();
  }

  const posting = extract(target, json);
  if (!posting || posting.text.length < MIN_POSTING_CHARS) throw unreadable();
  return { ...posting, text: posting.text.slice(0, MAX_POSTING_CHARS) };
}

/** Reads the body, refusing anything over `maxBytes` whatever it declares. */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (Number(res.headers.get("content-length") ?? 0) > maxBytes) {
    throw unreadable();
  }
  if (!res.body) return "";

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw unreadable();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");

function extract(target: Target, json: unknown): JobPosting | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Json;

  switch (target.provider) {
    case "greenhouse":
      // `content` is HTML that has itself been entity-escaped.
      return {
        provider: "greenhouse",
        title: str(j.title).trim(),
        company: str(j.company_name).trim() || null,
        text: htmlToText(decodeEntities(str(j.content))),
      };

    case "lever": {
      const lists = Array.isArray(j.lists) ? (j.lists as Json[]) : [];
      const body =
        str(j.descriptionPlain) ||
        [str(j.openingPlain), str(j.descriptionBodyPlain)].filter(Boolean).join("\n\n");
      return {
        provider: "lever",
        title: str(j.text).trim(),
        company: null,
        text: normalise(
          [
            body,
            ...lists.map((l) => `${str(l.text)}\n${htmlToText(str(l.content))}`),
            str(j.additionalPlain),
          ]
            .filter(Boolean)
            .join("\n\n"),
        ),
      };
    }

    case "ashby": {
      const jobs = Array.isArray(j.jobs) ? (j.jobs as Json[]) : [];
      const job = jobs.find((x) => x.id === target.postingId);
      if (!job) return null;
      return {
        provider: "ashby",
        title: str(job.title).trim(),
        company: null,
        text: normalise(
          str(job.descriptionPlain) || htmlToText(str(job.descriptionHtml)),
        ),
      };
    }

    case "smartrecruiters": {
      const sections = ((j.jobAd as Json | undefined)?.sections ?? {}) as Record<
        string,
        Json | undefined
      >;
      // The role first; the company blurb last, so truncation cuts the blurb.
      const order = [
        "jobDescription",
        "qualifications",
        "additionalInformation",
        "companyDescription",
      ];
      return {
        provider: "smartrecruiters",
        title: str(j.name).trim(),
        company: str((j.company as Json | undefined)?.name).trim() || null,
        text: normalise(
          order
            .map((k) => sections[k])
            .filter(Boolean)
            .map((s) => `${str(s!.title)}\n${htmlToText(str(s!.text))}`)
            .join("\n\n"),
        ),
      };
    }
  }
}

/** Posting HTML to plain text: block ends become line breaks, tags go. */
export function htmlToText(html: string): string {
  return normalise(
    decodeEntities(
      html
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
        // Each item starts its own line, so `</li>` needs no break of its own.
        .replace(/<li[^>]*>/gi, "\n- ")
        .replace(/<(br|\/p|\/div|\/ul|\/ol|\/h[1-6]|\/tr)\s*\/?>/gi, "\n")
        // Inline tags vanish ("<b>fast</b>." stays "fast."); others break words.
        .replace(/<\/?(a|b|i|em|strong|span|u|small|sup|sub|code)\b[^>]*>/gi, "")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1] === "x" || entity[1] === "X"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED[entity.toLowerCase()] ?? match;
  });
}

function normalise(text: string): string {
  return text
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
