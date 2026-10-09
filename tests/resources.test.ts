import { describe, it, expect } from "vitest";
import {
  githubRepo, classifyLink, paperDoi, arxivId, openAlexKey, groupRepos, formatAuthors, parseOpenAlexWork, buildCheatsheet,
} from "../shared/resources";

describe("githubRepo", () => {
  it("normalises to owner/repo", () => {
    expect(githubRepo("https://github.com/facebook/react")).toBe("facebook/react");
    expect(githubRepo("https://www.github.com/facebook/react/blob/main/README.md?x=1")).toBe("facebook/react");
    expect(githubRepo("https://github.com/o/r.git")).toBe("o/r");
    expect(githubRepo("https://github.com/o/r.")).toBe("o/r");
  });
  it("rejects site pages, profiles and other hosts", () => {
    expect(githubRepo("https://github.com/features/copilot")).toBeNull();
    expect(githubRepo("https://github.com/torvalds")).toBeNull();
    expect(githubRepo("https://gist.github.com/a/b")).toBeNull();
    expect(githubRepo("https://gitlab.com/a/b")).toBeNull();
    expect(githubRepo("not a url")).toBeNull();
  });
});

describe("classifyLink", () => {
  it("finds repositories, papers and docs", () => {
    expect(classifyLink("https://github.com/a/b")).toBe("repo");
    expect(classifyLink("https://arxiv.org/abs/1706.03762")).toBe("paper");
    expect(classifyLink("https://doi.org/10.1038/nature14539")).toBe("paper");
    expect(classifyLink("https://pubmed.ncbi.nlm.nih.gov/12345678/")).toBe("paper");
    expect(classifyLink("https://openreview.net/forum?id=abc")).toBe("paper");
    expect(classifyLink("https://www.nature.com/articles/s41586-021-03819-2")).toBe("paper");
    expect(classifyLink("https://www.science.org/doi/10.1126/science.abc1234")).toBe("paper");
    expect(classifyLink("https://docs.python.org/3/library/asyncio.html")).toBe("docs");
    expect(classifyLink("https://requests.readthedocs.io/en/latest/")).toBe("docs");
    expect(classifyLink("https://developer.mozilla.org/en-US/docs/Web/API/fetch")).toBe("docs");
    expect(classifyLink("https://kubernetes.io/docs/concepts/")).toBe("docs");
    expect(classifyLink("https://react.dev/reference/react/useState")).toBe("docs");
  });
  it("leaves everything else alone", () => {
    expect(classifyLink("https://example.com/shop")).toBe("other");
    expect(classifyLink("https://github.com/features")).toBe("other");
    expect(classifyLink("https://youtu.be/abc")).toBe("other");
    expect(classifyLink("ftp://x.org/docs/")).toBe("other");
  });
});

describe("paper identifiers", () => {
  it("reads DOIs and arXiv ids", () => {
    expect(paperDoi("https://doi.org/10.1038/NATURE14539")).toBe("10.1038/nature14539");
    expect(paperDoi("https://example.com/shop")).toBeNull();
    expect(arxivId("https://arxiv.org/abs/1706.03762v5")).toBe("1706.03762");
    expect(arxivId("https://arxiv.org/pdf/2401.00001.pdf")).toBe("2401.00001");
  });
  it("builds OpenAlex keys", () => {
    expect(openAlexKey("https://doi.org/10.1038/nature14539")).toBe("doi:10.1038/nature14539");
    expect(openAlexKey("https://arxiv.org/abs/1706.03762")).toBe("doi:10.48550/arxiv.1706.03762");
    expect(openAlexKey("https://pubmed.ncbi.nlm.nih.gov/123/")).toBe("pmid:123");
    expect(openAlexKey("https://openreview.net/forum?id=abc")).toBeNull();
  });
});

describe("groupRepos", () => {
  const l = (url: string, item_id: string, t: number | null, title = "V") => ({ url, item_id, timestamp_sec: t, items: { title: `${title}${item_id}` } });
  it("dedupes case-insensitively, lists each video once, sorts by mentions", () => {
    const g = groupRepos([
      l("https://github.com/A/b", "1", 90), l("https://github.com/a/B/issues", "1", 30), l("https://github.com/a/b", "2", null),
      l("https://github.com/x/y", "1", null), l("https://example.com", "1", null),
    ]);
    expect(g.map((r) => r.name)).toEqual(["A/b", "x/y"]);
    expect(g[0].mentions).toEqual([
      { item_id: "1", title: "V1", timestamp_sec: 30 },
      { item_id: "2", title: "V2", timestamp_sec: null },
    ]);
  });
});

describe("OpenAlex parsing", () => {
  it("formats authors", () => {
    expect(formatAuthors(["Ashish Vaswani"])).toBe("Vaswani");
    expect(formatAuthors(["A Smith", "B Jones"])).toBe("Smith and Jones");
    expect(formatAuthors(["A Smith", "B Jones", "C Wu"])).toBe("Smith, Jones et al.");
  });
  it("reads a work", () => {
    expect(parseOpenAlexWork({ title: "T", publication_year: 2017, authorships: [{ author: { display_name: "A B" } }], primary_location: { source: { display_name: "NeurIPS" } } }))
      .toEqual({ title: "T", authors: "B", year: 2017, venue: "NeurIPS" });
    expect(parseOpenAlexWork({})).toBeNull();
    expect(parseOpenAlexWork(null)).toBeNull();
  });
});

describe("buildCheatsheet", () => {
  it("groups links by kind and keeps summary and key points", () => {
    const md = buildCheatsheet([{
      title: "Intro [draft]", source_url: "https://youtu.be/x", summary: "S", key_points: ["k1"], channel: "Ch", topics: ["machine learning"], collections: ["Course"],
      links: [
        { url: "https://github.com/a/b", label: null, domain: "github.com", context: "code", timestamp_sec: 65 },
        { url: "https://arxiv.org/abs/1706.03762", label: "Attention", domain: "arxiv.org", context: null, timestamp_sec: null },
        { url: "https://docs.python.org/3/", label: "Python docs", domain: "docs.python.org", context: null, timestamp_sec: null },
        { url: "https://example.com", label: null, domain: "example.com", context: null, timestamp_sec: null },
      ],
      mentions: [], notes: ["my note"],
    }], "today");
    expect(md).toContain("## Intro \\[draft\\]");
    expect(md).toContain("#machine-learning");
    expect(md).toContain("### Repositories\n\n- [a/b](https://github.com/a/b) (1:05) — code");
    expect(md).toContain("### Papers\n\n- [Attention]");
    expect(md).toContain("### Documentation");
    expect(md).toContain("### Other links");
    expect(md).toContain("- k1");
    expect(md).toContain("my note");
  });
});
