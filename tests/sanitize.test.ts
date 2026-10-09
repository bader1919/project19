import { describe, expect, it } from "vitest";
import { cleanAnalysis, safeUrl, text } from "../server/sanitize";

describe("safeUrl", () => {
  it.each([
    ["https://example.com/a?b=1", "https://example.com/a?b=1"],
    ["http://example.com", "http://example.com/"],
    ["example.com/path", "https://example.com/path"],
    ["  https://ollama.com  ", "https://ollama.com/"],
  ])("accepts %s", (input, expected) => expect(safeUrl(input)).toBe(expected));

  it.each(["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>", "file:///etc/passwd", "ftp://x.com/f", "mailto:a@b.com", "localhost", "", 42, null, undefined, {}, `https://x.com/${"a".repeat(3000)}`])(
    "rejects %s",
    (input) => expect(safeUrl(input)).toBeNull(),
  );
});

describe("text", () => {
  it("trims, caps and rejects non-strings", () => {
    expect(text("  hi  ", 10)).toBe("hi");
    expect(text("abcdef", 3)).toBe("abc");
    expect(text("   ", 3)).toBeNull();
    expect(text({ evil: true }, 3)).toBeNull();
  });
});

describe("cleanAnalysis", () => {
  it("requires a summary", () => {
    expect(() => cleanAnalysis({})).toThrow(/summary/);
    expect(() => cleanAnalysis({ summary: "   " })).toThrow(/summary/);
    expect(() => cleanAnalysis({ summary: 5 })).toThrow(/summary/);
  });

  it("keeps well-formed input", () => {
    const out = cleanAnalysis({
      summary: "ملخص الفيديو",
      key_points: ["one", "two"],
      topics: ["AI", "Databases"],
      description_info: [{ kind: "Tool", text: "pgvector", url: "https://github.com/pgvector/pgvector" }],
      mentions: [{ kind: "book", name: "DDIA", context: "recommended", timestamp_sec: 600.7 }],
      link_labels: [{ url: "https://github.com/pgvector/pgvector", label: "pgvector repo" }],
      extra_links: [{ url: "https://dataintensive.net", label: "DDIA site", timestamp_sec: "600" }],
    });
    expect(out.summary).toBe("ملخص الفيديو");
    expect(out.topics).toEqual(["AI", "Databases"]);
    expect(out.description_info).toEqual([{ kind: "tool", text: "pgvector", url: "https://github.com/pgvector/pgvector", timestamp_sec: null }]);
    expect(out.mentions?.[0]).toMatchObject({ name: "DDIA", timestamp_sec: 600, url: null });
    expect(out.link_labels).toEqual([{ url: "https://github.com/pgvector/pgvector", label: "pgvector repo", context: null }]);
    expect(out.extra_links).toEqual([{ url: "https://dataintensive.net/", label: "DDIA site", context: null, timestamp_sec: 600 }]);
  });

  it("drops malformed entries instead of crashing", () => {
    const out = cleanAnalysis({
      summary: "s",
      key_points: "not an array",
      mentions: "oops",
      description_info: [null, 3, { text: { nested: 1 } }, { kind: "tool" }, { text: "ok" }],
      link_labels: "abc",
      extra_links: [{ url: "javascript:alert(1)", label: "x" }, { url: "https://ok.example.com", label: "" }],
    });
    expect(out.key_points).toEqual([]);
    expect(out.mentions).toEqual([]);
    expect(out.description_info).toEqual([{ kind: "other", text: "ok", url: null, timestamp_sec: null }]);
    expect(out.link_labels).toEqual([]);
    expect(out.extra_links).toEqual([]);
  });

  it("strips unsafe URLs from mentions and description info", () => {
    const out = cleanAnalysis({
      summary: "s",
      mentions: [{ kind: "tool", name: "x", url: "javascript:steal()" }],
      description_info: [{ kind: "tool", text: "y", url: "data:text/html,hi" }],
    });
    expect(out.mentions?.[0].url).toBeNull();
    expect(out.description_info?.[0].url).toBeNull();
  });

  it("caps list sizes", () => {
    const out = cleanAnalysis({ summary: "s", topics: Array.from({ length: 50 }, (_, i) => `t${i}`), key_points: Array(100).fill("p") });
    expect(out.topics).toHaveLength(12);
    expect(out.key_points).toHaveLength(40);
  });

  it("leaves optional sections undefined when not provided (so existing data is kept)", () => {
    const out = cleanAnalysis({ summary: "s" });
    expect(out.topics).toBeUndefined();
    expect(out.mentions).toBeUndefined();
    expect(out.description_info).toBeUndefined();
  });
});
