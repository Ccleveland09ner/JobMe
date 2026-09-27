import { describe, expect, it } from "vitest";

import {
  JobLinkError,
  MAX_POSTING_CHARS,
  decodeEntities,
  fetchJobPosting,
  htmlToText,
  resolveJobLink,
} from "./job-posting";

const API_HOSTS = new Set([
  "boards-api.greenhouse.io",
  "api.lever.co",
  "api.eu.lever.co",
  "api.ashbyhq.com",
  "api.smartrecruiters.com",
]);

const LONG = "Build and operate Go services on Postgres. ".repeat(5);

/** A fetch that records every request and answers with `body`. */
function stubFetch(body: unknown, init: ResponseInit = { status: 200 }) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url: string | URL | Request, reqInit?: RequestInit) => {
    calls.push({ url: String(url), init: reqInit });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), init);
  }) as typeof fetch;
  return { fetcher, calls };
}

describe("resolveJobLink — the allowlist", () => {
  const GH = "https://boards-api.greenhouse.io/v1/boards/airbnb/jobs/8232207";
  const LEVER_ID = "681fbc53-1e34-4a46-8677-3a78118674eb";

  it.each([
    ["https://boards.greenhouse.io/airbnb/jobs/8232207", GH],
    ["https://job-boards.greenhouse.io/airbnb/jobs/8232207?gh_src=abc", GH],
    ["https://boards.greenhouse.io/embed/job_app?for=airbnb&token=8232207", GH],
    ["https://careers.airbnb.com/positions/8232207?gh_jid=8232207", GH],
    [
      `https://jobs.lever.co/leverdemo/${LEVER_ID}`,
      `https://api.lever.co/v0/postings/leverdemo/${LEVER_ID}`,
    ],
    [
      `https://jobs.lever.co/leverdemo/${LEVER_ID}/apply`,
      `https://api.lever.co/v0/postings/leverdemo/${LEVER_ID}`,
    ],
    ["https://jobs.eu.lever.co/acme/abc-123", "https://api.eu.lever.co/v0/postings/acme/abc-123"],
    [
      "https://jobs.ashbyhq.com/ashby/7458d4e9-da2e-47bd-98cb-adfda43d42b2",
      "https://api.ashbyhq.com/posting-api/job-board/ashby",
    ],
    [
      "https://jobs.smartrecruiters.com/smartrecruiters/744000148454651-data-operations-consultant-",
      "https://api.smartrecruiters.com/v1/companies/smartrecruiters/postings/744000148454651",
    ],
  ])("reads %s", (link, api) => {
    expect(resolveJobLink(link).api).toBe(api);
  });

  it.each([
    ["LinkedIn", "https://www.linkedin.com/jobs/view/1234567890"],
    ["Indeed", "https://www.indeed.com/viewjob?jk=abc123"],
    ["Workday", "https://acme.wd5.myworkdayjobs.com/en-US/careers/job/Intern_R123"],
    ["Handshake", "https://joinhandshake.com/stu/jobs/123"],
    ["a generic page", "https://example.com/careers/backend-intern"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a file: URL", "file:///etc/passwd"],
    ["not a URL", "backend intern at acme"],
    // A host smuggled in through userinfo or an encoded path must not work.
    ["userinfo smuggling", "https://boards.greenhouse.io@169.254.169.254/latest/meta-data"],
    ["an encoded traversal", "https://jobs.lever.co/acme/..%2F..%2Fadmin"],
  ])("rejects %s", (_label, link) => {
    expect(() => resolveJobLink(link)).toThrow(JobLinkError);
  });
});

describe("fetchJobPosting — only ever the four fixed API hosts", () => {
  it("makes no request at all for an unsupported link", async () => {
    const { fetcher, calls } = stubFetch({});
    await expect(
      fetchJobPosting("https://www.linkedin.com/jobs/view/1", fetcher),
    ).rejects.toMatchObject({ code: "unsupported" });
    expect(calls).toHaveLength(0);
  });

  /**
   * An arbitrary host in a gh_jid link only ever becomes a PATH SEGMENT of a
   * request to Greenhouse's own API — never a request to that host.
   */
  it("never contacts the host in the link, even an internal one", async () => {
    const { fetcher, calls } = stubFetch({ title: "x", content: LONG });
    await fetchJobPosting("http://169.254.169.254/latest?gh_jid=1", fetcher);
    expect(API_HOSTS.has(new URL(calls[0].url).hostname)).toBe(true);
  });

  it("refuses redirects and sets a timeout", async () => {
    const { fetcher, calls } = stubFetch({ title: "Intern", content: LONG });
    await fetchJobPosting("https://boards.greenhouse.io/acme/jobs/1", fetcher);
    expect(calls[0].init?.redirect).toBe("error");
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("treats a failed or missing posting as unreadable", async () => {
    const { fetcher } = stubFetch({ error: "not found" }, { status: 404 });
    await expect(
      fetchJobPosting("https://boards.greenhouse.io/acme/jobs/1", fetcher),
    ).rejects.toMatchObject({ code: "unreadable" });
  });

  it("refuses a body over the size cap", async () => {
    const { fetcher } = stubFetch({ title: "x", content: "y".repeat(1024 * 1024 + 10) });
    await expect(
      fetchJobPosting("https://boards.greenhouse.io/acme/jobs/1", fetcher),
    ).rejects.toMatchObject({ code: "unreadable" });
  });

  it("rejects a posting too short to be real", async () => {
    const { fetcher } = stubFetch({ title: "x", content: "&lt;p&gt;Apply now&lt;/p&gt;" });
    await expect(
      fetchJobPosting("https://boards.greenhouse.io/acme/jobs/1", fetcher),
    ).rejects.toMatchObject({ code: "unreadable" });
  });
});

describe("fetchJobPosting — extraction per provider", () => {
  it("Greenhouse: unescapes the escaped HTML content", async () => {
    const { fetcher } = stubFetch({
      title: "Backend Intern",
      company_name: "Airbnb",
      content:
        "&lt;p&gt;Build &amp;amp; run Go services.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Postgres&lt;/li&gt;&lt;/ul&gt;" +
        `&lt;p&gt;${LONG}&lt;/p&gt;`,
    });
    const posting = await fetchJobPosting("https://boards.greenhouse.io/airbnb/jobs/1", fetcher);
    expect(posting).toMatchObject({ provider: "greenhouse", title: "Backend Intern", company: "Airbnb" });
    expect(posting.text).toContain("Build & run Go services.");
    expect(posting.text).toContain("\n- Postgres\n");
    expect(posting.text).not.toMatch(/[<>]|&lt;|&amp;/);
  });

  it("Lever: joins the description, lists and closing text", async () => {
    const { fetcher } = stubFetch({
      text: "Platform Intern",
      descriptionPlain: LONG,
      lists: [{ text: "Requirements", content: "<li>Go</li><li>SQL</li>" }],
      additionalPlain: "We sponsor visas.",
    });
    const posting = await fetchJobPosting("https://jobs.lever.co/acme/abc-123", fetcher);
    expect(posting.title).toBe("Platform Intern");
    expect(posting.text).toContain("Requirements\n- Go\n- SQL");
    expect(posting.text).toContain("We sponsor visas.");
  });

  it("Ashby: picks the posting out of the whole board", async () => {
    const { fetcher } = stubFetch({
      jobs: [
        { id: "other", title: "Designer", descriptionPlain: "Design things. ".repeat(10) },
        { id: "7458d4e9", title: "SWE Intern", descriptionPlain: LONG },
      ],
    });
    const posting = await fetchJobPosting("https://jobs.ashbyhq.com/acme/7458d4e9", fetcher);
    expect(posting.title).toBe("SWE Intern");

    await expect(
      fetchJobPosting("https://jobs.ashbyhq.com/acme/missing", fetcher),
    ).rejects.toMatchObject({ code: "unreadable" });
  });

  it("SmartRecruiters: the role's sections first, the company blurb last", async () => {
    const { fetcher } = stubFetch({
      name: "Data Intern",
      company: { name: "SmartRecruiters Inc" },
      jobAd: {
        sections: {
          companyDescription: { title: "About us", text: "<p>We make hiring software.</p>" },
          jobDescription: { title: "The role", text: `<p>${LONG}</p>` },
          qualifications: { title: "You have", text: "<ul><li>SQL</li></ul>" },
        },
      },
    });
    const posting = await fetchJobPosting(
      "https://jobs.smartrecruiters.com/acme/744000148454651-data-intern",
      fetcher,
    );
    expect(posting.company).toBe("SmartRecruiters Inc");
    expect(posting.text.indexOf("The role")).toBeLessThan(posting.text.indexOf("About us"));
  });

  it("caps the text it returns", async () => {
    const { fetcher } = stubFetch({ title: "x", descriptionPlain: "word ".repeat(5000) });
    const posting = await fetchJobPosting("https://jobs.lever.co/acme/abc", fetcher);
    expect(posting.text.length).toBeLessThanOrEqual(MAX_POSTING_CHARS);
  });
});

describe("htmlToText / decodeEntities", () => {
  it("turns block ends into line breaks and drops tags", () => {
    expect(htmlToText("<h2>Role</h2><p>Ship <b>fast</b>.</p><br/>Done")).toBe(
      "Role\nShip fast.\n\nDone",
    );
  });

  it("drops script and style content entirely", () => {
    expect(htmlToText("<style>p{}</style><script>alert(1)</script><p>Hi</p>")).toBe("Hi");
  });

  it("decodes named and numeric entities, and leaves unknown ones alone", () => {
    expect(decodeEntities("&amp; &#39; &#x2014; &quot;x&quot; &bogus;")).toBe(
      `& ' — "x" &bogus;`,
    );
  });
});
