/**
 * Which posting links can be read, and the one fixed API each maps to.
 * Allowlist only, so nothing else is ever fetched (no SSRF). Pure: the setup
 * clipboard checks links in the browser with the same rules.
 */

export type JobProvider = "greenhouse" | "lever" | "ashby" | "smartrecruiters";

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

const ONE_MB = 1024 * 1024;

/** A path segment we are willing to place in an upstream URL. */
const SEGMENT = /^[A-Za-z0-9_-]{1,100}$/;

export interface Target {
  provider: JobProvider;
  /** Always one of four fixed hosts; only ids come from the link. */
  api: string;
  /** Ashby only lists whole boards: the posting to pick out of it. */
  postingId?: string;
  /** The board name in the link, for providers whose API omits the company. */
  board?: string;
  maxBytes: number;
}

const unsupported = () =>
  new JobLinkError(
    "We can't read postings from that site. Paste the job description instead.",
    "unsupported",
  );

export const unreadable = () =>
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
        board: site,
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
        board: org,
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

  // A careers page embedding Greenhouse (?gh_jid=). The board is usually the
  // domain name; only Greenhouse's host is contacted, so a wrong guess is a 404.
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
