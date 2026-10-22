/**
 * Reads a job posting from a link that lib/job-link.ts accepted: only that
 * provider's fixed public API is called. Anything else raises JobLinkError
 * ("paste the description instead").
 */

import { resolveJobLink, unreadable, type JobProvider, type Target } from "./job-link";

export { JobLinkError, resolveJobLink, type JobProvider } from "./job-link";

export interface JobPosting {
  provider: JobProvider;
  title: string;
  company: string | null;
  /**
   * True when `company` was read from the link's board name (Lever, Ashby)
   * rather than stated by the posting. Usually right, but a board slug is not
   * always the trading name, so the setup screen shows it for confirmation.
   */
  companyInferred: boolean;
  /** Plain text, whitespace-normalised, capped at MAX_POSTING_CHARS. */
  text: string;
}

export const FETCH_TIMEOUT_MS = 4000;
export const MAX_POSTING_CHARS = 8000;

/** Too short to be a real posting — probably an error page or a stub. */
const MIN_POSTING_CHARS = 80;

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
        companyInferred: false,
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
        company: companyFromBoard(target.board),
        companyInferred: Boolean(target.board),
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
        company: companyFromBoard(target.board),
        companyInferred: Boolean(target.board),
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
        companyInferred: false,
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

/**
 * A board name as a company name: "acme-robotics" -> "Acme Robotics". Only a
 * guess (a board can be named anything), hence `companyInferred`; nothing
 * about the company beyond its name is ever derived from it.
 */
export function companyFromBoard(board: string | undefined): string | null {
  const words = board
    ?.split(/[-_]+/)
    .filter((w) => w && !/^\d+$/.test(w));
  if (!words?.length) return null;
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
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
