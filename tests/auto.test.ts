import { describe, expect, it, vi } from "vitest";
import { analyzeWithGemma, GEMMA_MODELS, transcribeStep } from "../server/auto";
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
    expect(hosts).toEqual(["api.supadata.ai"]);
    const sched = updates.find((u) => u.table === "video_details")?.patch;
    expect(sched?.auto_attempts).toBe(2);
  });
});
