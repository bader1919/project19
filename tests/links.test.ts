import { describe, it, expect, vi } from "vitest";
import {
  extractDescriptionLinks,
  extractTranscriptLinks,
  mergeLinks,
  extractChapters,
  parseTimestamp,
  expandShortLinks,
  domainOf,
} from "../server/links";
import type { ExtractedLink } from "../shared/types";

const urls = (d: string) => extractDescriptionLinks(d).map((l) => l.url);

describe("extractDescriptionLinks", () => {
  it("takes context from the same line", () => {
    const [l] = extractDescriptionLinks("Get the tool here: https://example.com/tool");
    expect(l).toMatchObject({
      url: "https://example.com/tool",
      domain: "example.com",
      context: "Get the tool here",
      source: "description",
      timestamp_sec: null,
    });
  });

  it("takes context from the line above when URL is alone", () => {
    const [l] = extractDescriptionLinks("My favourite editor:\nhttps://code.example.org/editor");
    expect(l.context).toBe("My favourite editor");
  });

  it("skips blank lines when looking above", () => {
    const [l] = extractDescriptionLinks("Notion template:\n\nhttps://example.com/n");
    expect(l.context).toBe("Notion template");
  });

  it("does not borrow context from a previous line that itself has a URL", () => {
    const links = extractDescriptionLinks("https://a.example.com/x\nhttps://b.example.com/y");
    expect(links[1].context).toBe("");
  });

  it("has empty context when nothing is around", () => {
    expect(extractDescriptionLinks("https://example.com/solo")[0].context).toBe("");
  });

  it("strips trailing Latin punctuation", () => {
    expect(urls("see https://example.com/a. and https://example.com/b, then https://example.com/c!")).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
    ]);
  });

  it.each(["،", "؛", "؟", "…", "."])("strips trailing %s", (p) => {
    expect(urls(`رابط https://example.com/page${p}`)).toEqual(["https://example.com/page"]);
  });

  it("strips multiple trailing punctuation chars", () => {
    expect(urls("https://example.com/a?!…")).toEqual(["https://example.com/a"]);
  });

  it("drops ) closing a paren opened outside the url", () => {
    expect(urls("(see https://x.com/a)")).toEqual(["https://x.com/a"]);
    expect(urls("(see https://x.com/a).")).toEqual(["https://x.com/a"]);
  });

  it("keeps balanced parens in wikipedia style urls", () => {
    expect(urls("https://en.wikipedia.org/wiki/Foo_(bar)")).toEqual(["https://en.wikipedia.org/wiki/Foo_(bar)"]);
    expect(urls("read https://en.wikipedia.org/wiki/Foo_(bar).")).toEqual(["https://en.wikipedia.org/wiki/Foo_(bar)"]);
    expect(urls("(see https://en.wikipedia.org/wiki/Foo_(bar))")).toEqual(["https://en.wikipedia.org/wiki/Foo_(bar)"]);
  });

  it("adds https:// to www. links", () => {
    const [l] = extractDescriptionLinks("site: www.example.com/path");
    expect(l.url).toBe("https://www.example.com/path");
    expect(l.domain).toBe("example.com");
  });

  it("dedupes identical urls", () => {
    const links = extractDescriptionLinks("first https://example.com/x\nsecond https://example.com/x\nc www.other.com");
    expect(links.map((l) => l.url)).toEqual(["https://example.com/x", "https://www.other.com/"]);
    expect(links[0].context).toBe("first");
  });

  it("dedupes www. and https:// variants resolving to the same url", () => {
    expect(urls("https://www.example.com/ and www.example.com/")).toEqual(["https://www.example.com/"]);
  });

  it("handles Arabic text around links", () => {
    const [l] = extractDescriptionLinks("حمّل الأداة من هنا: https://example.com/ar، شكراً");
    expect(l.url).toBe("https://example.com/ar");
    expect(l.context).toContain("حمّل الأداة من هنا");
  });

  it("Arabic label on the line above", () => {
    const [l] = extractDescriptionLinks("الموقع الرسمي:\nhttps://example.com/");
    expect(l.context).toBe("الموقع الرسمي");
  });

  it("finds several urls on one line", () => {
    expect(urls("https://a.com/1 https://b.com/2")).toEqual(["https://a.com/1", "https://b.com/2"]);
  });

  it("handles CRLF", () => {
    const [l] = extractDescriptionLinks("Label:\r\nhttps://example.com/x\r\n");
    expect(l.url).toBe("https://example.com/x");
    expect(l.context).toBe("Label");
  });

  it("ignores hosts without a dot and unparseable urls", () => {
    expect(urls("http://localhost/x and https://nodot")).toEqual([]);
  });

  it("returns [] for no links / empty", () => {
    expect(extractDescriptionLinks("")).toEqual([]);
    expect(extractDescriptionLinks("just text, no links")).toEqual([]);
  });

  it("truncates context to 200 chars", () => {
    const [l] = extractDescriptionLinks("x".repeat(500) + " https://example.com/");
    expect(l.context.length).toBeLessThanOrEqual(200);
  });

  it("handles urls with query strings and fragments", () => {
    expect(urls("https://example.com/a?b=1&c=2#frag")).toEqual(["https://example.com/a?b=1&c=2#frag"]);
  });
});

describe("extractTranscriptLinks", () => {
  it("uses floor of segment start as timestamp", () => {
    const links = extractTranscriptLinks([
      { start: 0, dur: 2, text: "hello" },
      { start: 75.9, dur: 3, text: "go to https://example.com/foo. it's great" },
    ]);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      url: "https://example.com/foo",
      source: "transcript",
      timestamp_sec: 75,
      domain: "example.com",
    });
    expect(links[0].context).toContain("go to");
  });

  it("dedupes across segments keeping the first timestamp", () => {
    const links = extractTranscriptLinks([
      { start: 10, dur: 1, text: "see www.example.com" },
      { start: 20, dur: 1, text: "again www.example.com" },
    ]);
    expect(links).toHaveLength(1);
    expect(links[0].timestamp_sec).toBe(10);
  });

  it("returns [] when no links", () => {
    expect(extractTranscriptLinks([{ start: 1, dur: 1, text: "nothing" }])).toEqual([]);
    expect(extractTranscriptLinks([])).toEqual([]);
  });
});

describe("mergeLinks", () => {
  const mk = (url: string, source: ExtractedLink["source"]): ExtractedLink => ({
    url, domain: domainOf(url), context: "", source, timestamp_sec: null,
  });
  it("dedupes by url keeping first occurrence and order", () => {
    const merged = mergeLinks(
      [mk("https://a.com/", "description"), mk("https://b.com/", "description")],
      [mk("https://b.com/", "transcript"), mk("https://c.com/", "transcript")],
    );
    expect(merged.map((l) => [l.url, l.source])).toEqual([
      ["https://a.com/", "description"],
      ["https://b.com/", "description"],
      ["https://c.com/", "transcript"],
    ]);
  });
  it("handles no lists", () => {
    expect(mergeLinks()).toEqual([]);
    expect(mergeLinks([], [])).toEqual([]);
  });
});

describe("parseTimestamp", () => {
  it.each([
    ["0:00", 0],
    ["1:05", 65],
    ["10:30", 630],
    ["1:00:00", 3600],
    ["1:02:03", 3723],
    ["00:00", 0],
  ])("%s -> %d", (s, n) => expect(parseTimestamp(s)).toBe(n));
});

describe("extractChapters", () => {
  it("parses a standard chapter list", () => {
    const d = "Intro text\n0:00 Intro\n1:30 Setup\n10:05 Deep dive\nlinks below";
    expect(extractChapters(d)).toEqual([
      { kind: "chapter", text: "Intro", timestamp_sec: 0 },
      { kind: "chapter", text: "Setup", timestamp_sec: 90 },
      { kind: "chapter", text: "Deep dive", timestamp_sec: 605 },
    ]);
  });

  it("supports h:mm:ss", () => {
    const c = extractChapters("0:00 Start\n1:00:00 Hour mark\n1:30:15 Later");
    expect(c.map((x) => x.timestamp_sec)).toEqual([0, 3600, 5415]);
  });

  it("supports (00:00) Intro and [00:00] forms and separators", () => {
    const c = extractChapters("(00:00) Intro\n[01:00] - Middle\n02:00 – End\n03:00: Outro\n04:00 | Bye");
    expect(c.map((x) => x.text)).toEqual(["Intro", "Middle", "End", "Outro", "Bye"]);
  });

  it("supports Arabic titles", () => {
    const c = extractChapters("0:00 المقدمة\n2:10 الشرح");
    expect(c.map((x) => x.text)).toEqual(["المقدمة", "الشرح"]);
  });

  it("requires at least 2 chapters", () => {
    expect(extractChapters("0:00 Only one")).toEqual([]);
  });

  it("requires first chapter at 0:00", () => {
    expect(extractChapters("0:30 Late start\n1:00 Next\n2:00 More")).toEqual([]);
  });

  it("returns [] with no timestamps", () => {
    expect(extractChapters("hello\nworld")).toEqual([]);
    expect(extractChapters("")).toEqual([]);
  });

  it("skips timestamp-only lines", () => {
    const c = extractChapters("0:00 Intro\n1:00\n2:00 End");
    expect(c.map((x) => x.text)).toEqual(["Intro", "End"]);
  });

  it("handles CRLF", () => {
    expect(extractChapters("0:00 A\r\n1:00 B\r\n")).toHaveLength(2);
  });
});

describe("expandShortLinks", () => {
  const link = (url: string) => ({ url, domain: domainOf(url), context: "c" });

  it("expands bit.ly using the final response url", async () => {
    const fetchImpl = vi.fn(async () => ({ url: "https://www.example.com/long/page" }) as Response);
    const [out] = await expandShortLinks([link("https://bit.ly/abc")], fetchImpl as unknown as typeof fetch);
    expect(out.url).toBe("https://www.example.com/long/page");
    expect(out.domain).toBe("example.com");
    expect((out as { original_url?: string }).original_url).toBe("https://bit.ly/abc");
    expect(out.context).toBe("c");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = (fetchImpl.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.method).toBe("HEAD");
    expect(init.redirect).toBe("follow");
  });

  it("leaves non-shortener links untouched and does not fetch", async () => {
    const fetchImpl = vi.fn();
    const l = link("https://example.com/x");
    const [out] = await expandShortLinks([l], fetchImpl as unknown as typeof fetch);
    expect(out).toBe(l);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps link when fetch throws", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("boom"); });
    const l = link("https://t.co/xyz");
    const [out] = await expandShortLinks([l], fetchImpl as unknown as typeof fetch);
    expect(out).toEqual(l);
    expect((out as { original_url?: string }).original_url).toBeUndefined();
  });

  it("keeps link when response url is unchanged or empty", async () => {
    const same = vi.fn(async () => ({ url: "https://tinyurl.com/q" }) as Response);
    const empty = vi.fn(async () => ({ url: "" }) as Response);
    const l = link("https://tinyurl.com/q");
    expect((await expandShortLinks([l], same as unknown as typeof fetch))[0]).toEqual(l);
    expect((await expandShortLinks([l], empty as unknown as typeof fetch))[0]).toEqual(l);
  });

  it("handles a mixed list preserving order", async () => {
    const fetchImpl = vi.fn(async () => ({ url: "https://dest.example.net/z" }) as Response);
    const out = await expandShortLinks(
      [link("https://example.com/a"), link("https://amzn.to/1"), link("https://example.org/b")],
      fetchImpl as unknown as typeof fetch,
    );
    expect(out.map((o) => o.url)).toEqual(["https://example.com/a", "https://dest.example.net/z", "https://example.org/b"]);
  });

  it("returns [] for empty input", async () => {
    expect(await expandShortLinks([], vi.fn() as unknown as typeof fetch)).toEqual([]);
  });
});
