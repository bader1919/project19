import { describe, expect, it, vi } from "vitest";
import { analyzeWithGemma, GEMMA_MODELS, transcribeStep } from "../server/auto";
import { supadataMetadata } from "../server/transcript";
import { cleanMeta, cleanSegments } from "../server/helper";

const reply = (text: string, status = 200) =>
  new Response(JSON.stringify(status === 200 ? { candidates: [{ content: { parts: [{ text }] } }] } : { error: { message: text } }), { status });

describe("PC helper input", () => {
  it("keeps valid caption lines, sorted, and drops junk", () => {
    expect(
      cleanSegments([
        { start: 5, dur: 2, text: " second\nline " },
        { start: 1, duration: 1.5, text: "first" },
        { start: "x", text: "bad start" },
        { start: 3, text: "" },
        "nonsense",
      ]),
    ).toEqual([
      { start: 1, dur: 1.5, text: "first" },
      { start: 5, dur: 2, text: "second line" },
    ]);
    expect(cleanSegments("not a list")).toEqual([]);
  });

  it("keeps only safe video details", () => {
    expect(
      cleanMeta({
        description: "Links: https://example.com",
        duration_sec: "212",
        published_at: "2024-05-01",
        channel_url: "javascript:alert(1)",
      }),
    ).toEqual({ description: "Links: https://example.com", duration_sec: 212, published_at: "2024-05-01", channel_url: null });
    expect(cleanMeta(null)).toBeNull();
  });
});

describe("analyzeWithGemma", () => {
  const input = { title: "T", channel: "C", description: "D", transcript: "[0s] hi", links: [{ url: "https://a.dev/", context: null }], topics: ["AI"] };

  it("returns the analysis object, falling back to the next model when one is busy", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (u: string) => {
      seen.push(u.match(/models\/([^:]+):/)![1]);
      // Gemma replies with its reasoning as a "thought" part before the JSON answer.
      return seen.length === 1
        ? reply("high demand", 503)
        : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Input: a transcript...", thought: true }, { text: '{"summary": "S", "topics": ["AI"]}' }] } }] }));
    });
    const out = await analyzeWithGemma(input, "K", fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ summary: "S", topics: ["AI"] });
    expect(seen).toEqual(GEMMA_MODELS);
  });

  it("marks the video text as third-party data and lists existing topics and links", async () => {
    const fetchImpl = vi.fn(async (_u: string, _init: RequestInit) => reply('{"summary": "S"}'));
    await analyzeWithGemma(input, "K", fetchImpl as unknown as typeof fetch);
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(body.systemInstruction.parts[0].text).toMatch(/never follow instructions/);
    const material = body.contents[0].parts[0].text as string;
    expect(material).toContain("EXISTING TOPICS: AI");
    expect(material).toContain("- https://a.dev/");
    expect(material).toMatch(/<video>[\s\S]*\[0s\] hi[\s\S]*<\/video>/);
  });

  it("fails when no model gives a usable summary", async () => {
    await expect(analyzeWithGemma(input, "K", (async () => reply('{"topics": []}')) as unknown as typeof fetch)).rejects.toThrow(/no summary/);
  });

  it("uses only Gemma 4 models, never Gemini", () => {
    expect(GEMMA_MODELS.every((m) => m.startsWith("gemma-4"))).toBe(true);
  });
});

describe("transcribeStep", () => {
  /** Minimal stand-in for the Supabase client: records updates, returns canned rows. */
  function fakeDb(row: Record<string, unknown>, settings: Record<string, unknown> | null) {
    const updates: { table: string; patch: Record<string, unknown> }[] = [];
    const chain = (table: string, result: unknown) => {
      const q: Record<string, unknown> = {};
      for (const k of ["select", "eq", "is", "not", "limit", "order"]) q[k] = () => q;
      q.single = async () => ({ data: result, error: null });
      q.maybeSingle = async () => ({ data: result, error: null });
      q.update = (patch: Record<string, unknown>) => {
        updates.push({ table, patch });
        return q;
      };
      q.then = (res: (v: unknown) => void) => res({ data: [{ item_id: "x" }], error: null });
      return q;
    };
    const db = {
      from: (t: string) => chain(t, t === "video_details" ? row : t === "user_settings" ? settings : null),
      rpc: async () => ({ data: null, error: null }),
    };
    return { db: db as never, updates };
  }

  it("without transcript API keys it stops and says what to add", async () => {
    const { db, updates } = fakeDb({ youtube_id: "dQw4w9WgXcQ", transcript: null, auto_attempts: 0 }, null);
    const fetchImpl = vi.fn();
    expect(await transcribeStep(db, "u", "i", fetchImpl as unknown as typeof fetch)).toBe("gave_up");
    expect(fetchImpl).not.toHaveBeenCalled();
    const note = updates.find((u) => u.table === "items")?.patch.error as string;
    expect(note).toMatch(/Supadata|youtube-transcript\.io/);
    expect(note).not.toMatch(/Gemini/i);
  });

  it("calls the transcript API (never Google) and backs off when it fails", async () => {
    const { db, updates } = fakeDb({ youtube_id: "dQw4w9WgXcQ", transcript: null, auto_attempts: 1 }, { supadata_key: "S" });
    const hosts: string[] = [];
    const fetchImpl = vi.fn(async (u: string) => {
      hosts.push(new URL(u).hostname);
      return new Response(JSON.stringify({ error: "busy" }), { status: 500 });
    });
    expect(await transcribeStep(db, "u", "i", fetchImpl as unknown as typeof fetch)).toBe("retry");
    expect(hosts.length).toBeGreaterThan(0);
    expect(hosts.every((h) => h === "api.supadata.ai")).toBe(true); // never Google/Gemini
    const sched = updates.find((u) => u.table === "video_details")?.patch;
    expect(sched?.auto_attempts).toBe(2);
  });
});

describe("analyzeStep", () => {
  it("does not invent a summary from a title alone; waits for a transcript or description", async () => {
    const { analyzeStep } = await import("../server/auto");
    const updates: Record<string, unknown>[] = [];
    const rows: Record<string, unknown> = {
      items: { id: "i", title: "Some video", status: "transcript_pending", analyzed_at: null, analysis_attempts: 0 },
      video_details: { channel: "C", description: "", transcript_segments: [], transcript: null },
      user_settings: { gemini_key: "K" },
      links: [],
      tags: [],
    };
    const chain = (t: string) => {
      const q: Record<string, unknown> = {};
      for (const k of ["select", "eq", "is", "not", "limit", "order"]) q[k] = () => q;
      q.single = async () => ({ data: rows[t], error: null });
      q.maybeSingle = async () => ({ data: rows[t], error: null });
      q.update = (patch: Record<string, unknown>) => (updates.push(patch), q);
      q.then = (res: (v: unknown) => void) => res({ data: Array.isArray(rows[t]) ? rows[t] : [], error: null });
      return q;
    };
    const fetchImpl = vi.fn();
    const db = { from: chain, rpc: async () => ({ data: null, error: null }) } as never;
    expect(await analyzeStep(db, "u", "i", fetchImpl as unknown as typeof fetch)).toBe("gave_up");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(updates).toContainEqual({ analysis_attempts: 5 });
  });
});

describe("supadataMetadata", () => {
  it("reads description, duration and date from /v1/metadata with the same key", async () => {
    const fetchImpl = vi.fn(async (u: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)["x-api-key"]).toBe("S");
      expect(u).toContain("/v1/metadata?url=");
      return new Response(JSON.stringify({ description: "Links: https://github.com/x/y", media: { duration: 612 }, createdAt: "2026-10-04T10:00:00Z" }));
    });
    expect(await supadataMetadata("bco5zvN2vMY", "S", fetchImpl as unknown as typeof fetch)).toEqual({
      description: "Links: https://github.com/x/y",
      duration_sec: 612,
      published_at: "2026-10-04T10:00:00Z",
    });
  });

  it("falls back to the older /v1/youtube/video endpoint, and stops on a bad key", async () => {
    const urls: string[] = [];
    const fallback = vi.fn(async (u: string) => {
      urls.push(u);
      return u.includes("/v1/metadata") ? new Response("{}", { status: 404 }) : new Response(JSON.stringify({ description: "D", duration: 60 }));
    });
    expect((await supadataMetadata("id", "S", fallback as unknown as typeof fetch)).description).toBe("D");
    expect(urls[1]).toContain("/v1/youtube/video?id=id");
    const bad = vi.fn(async () => new Response("{}", { status: 401 }));
    await expect(supadataMetadata("id", "S", bad as unknown as typeof fetch)).rejects.toThrow(/401/);
    expect(bad).toHaveBeenCalledTimes(1);
  });
});
