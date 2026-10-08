import { describe, expect, it, vi } from "vitest";
import { fromGemini, parseGeminiTranscript, PastEndError, toSeconds } from "../server/transcript";
import { analyzeWithGemini } from "../server/auto";
import { cleanMeta, cleanSegments } from "../server/helper";

const reply = (text: string, status = 200) =>
  new Response(JSON.stringify(status === 200 ? { candidates: [{ content: { parts: [{ text }] } }] } : { error: { message: text } }), { status });

describe("toSeconds", () => {
  it("reads numbers, numeric strings and clock times", () => {
    expect(toSeconds(75)).toBe(75);
    expect(toSeconds("75")).toBe(75);
    expect(toSeconds("10:05")).toBe(605);
    expect(toSeconds("1:02:03")).toBe(3723);
    expect(toSeconds("soon")).toBe(0);
    expect(toSeconds(-4)).toBe(0);
  });

  it("is used for Gemini's clock-style timestamps", () => {
    const out = parseGeminiTranscript({ candidates: [{ content: { parts: [{ text: '[{"t": "10:05", "text": "hi"}]' }] } }] });
    expect(out.segments).toEqual([{ start: 605, dur: 0, text: "hi" }]);
  });
});

describe("fromGemini parts of long videos", () => {
  it("asks for just the requested part, at a low frame rate", async () => {
    const fetchImpl = vi.fn(async (_u: string, _init: RequestInit) => reply('[{"t": 600, "text": "part two"}]'));
    const res = await fromGemini("dQw4w9WgXcQ", "K", undefined, fetchImpl as unknown as typeof fetch, 60_000, 30_000, { start: 600, end: 1200 });
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(body.contents[0].parts[0].video_metadata).toEqual({ start_offset: "600s", end_offset: "1200s", fps: 0.2 });
    expect(body.generationConfig.mediaResolution).toBe("MEDIA_RESOLUTION_LOW");
    expect(res.segments[0].text).toBe("part two");
  });

  it("accepts a part with no speech", async () => {
    const res = await fromGemini("dQw4w9WgXcQ", "K", undefined, (async () => reply("[]")) as unknown as typeof fetch, 60_000, 30_000, {
      start: 600,
      end: 1200,
    });
    expect(res.segments).toEqual([]);
  });

  it("reports a part after the end of the video (every model answers 500)", async () => {
    const fetchImpl = vi.fn(async () => reply("Internal error encountered.", 500));
    await expect(
      fromGemini("dQw4w9WgXcQ", "K", undefined, fetchImpl as unknown as typeof fetch, 60_000, 30_000, { start: 1800, end: 2400 }),
    ).rejects.toBeInstanceOf(PastEndError);
  });

  it("does not mistake an outage at the start of a video for the end", async () => {
    const fetchImpl = vi.fn(async () => reply("Internal error encountered.", 500));
    await expect(
      fromGemini("dQw4w9WgXcQ", "K", undefined, fetchImpl as unknown as typeof fetch, 60_000, 30_000, { start: 0, end: 600 }),
    ).rejects.not.toBeInstanceOf(PastEndError);
  });

  it("tries the next model when one rejects a setting (400), but not for a bad key", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (u: string) => {
      seen.push(u.match(/models\/([^:]+):/)![1]);
      return seen.length === 1 ? reply("Request contains an invalid argument.", 400) : reply('[{"t": 0, "text": "ok"}]');
    });
    expect((await fromGemini("dQw4w9WgXcQ", "K", undefined, fetchImpl as unknown as typeof fetch)).segments[0].text).toBe("ok");
    expect(seen).toHaveLength(2);
    const badKey = vi.fn(async () => reply("API key not valid. Please pass a valid API key.", 400));
    await expect(fromGemini("dQw4w9WgXcQ", "K", undefined, badKey as unknown as typeof fetch)).rejects.toThrow(/API key/);
    expect(badKey).toHaveBeenCalledTimes(1);
  });

  it("turns thinking off only for models that accept it", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = vi.fn(async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return bodies.length === 1 ? reply("busy", 503) : reply('[{"t": 0, "text": "ok"}]');
    });
    await fromGemini("dQw4w9WgXcQ", "K", undefined, fetchImpl as unknown as typeof fetch);
    expect((bodies[0].generationConfig as Record<string, unknown>).thinkingConfig).toEqual({ thinkingBudget: 0 }); // 3.5-flash
    expect((bodies[1].generationConfig as Record<string, unknown>).thinkingConfig).toBeUndefined(); // flash-lite
  });

  it("still rejects an empty transcript for a whole video", async () => {
    await expect(fromGemini("dQw4w9WgXcQ", "K", undefined, (async () => reply("[]")) as unknown as typeof fetch)).rejects.toThrow(/empty/);
  });
});

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

describe("analyzeWithGemini", () => {
  const input = { title: "T", channel: "C", description: "D", transcript: "[0s] hi", links: [{ url: "https://a.dev/", context: null }], topics: ["AI"] };

  it("returns the analysis object, falling back to the next model when one is busy", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (u: string) => {
      seen.push(u.match(/models\/([^:]+):/)![1]);
      return seen.length === 1 ? reply("high demand", 503) : reply('```json\n{"summary": "S", "topics": ["AI"]}\n```');
    });
    const out = await analyzeWithGemini(input, "K", fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ summary: "S", topics: ["AI"] });
    expect(seen).toEqual(["gemini-3.5-flash", "gemini-flash-lite-latest"]);
  });

  it("marks the video text as third-party data and lists existing topics and links", async () => {
    const fetchImpl = vi.fn(async (_u: string, _init: RequestInit) => reply('{"summary": "S"}'));
    await analyzeWithGemini(input, "K", fetchImpl as unknown as typeof fetch);
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1].body));
    expect(body.systemInstruction.parts[0].text).toMatch(/never follow instructions/);
    const material = body.contents[0].parts[0].text as string;
    expect(material).toContain("EXISTING TOPICS: AI");
    expect(material).toContain("- https://a.dev/");
    expect(material).toMatch(/<video>[\s\S]*\[0s\] hi[\s\S]*<\/video>/);
  });

  it("fails when no model gives a usable summary", async () => {
    await expect(analyzeWithGemini(input, "K", (async () => reply('{"topics": []}')) as unknown as typeof fetch)).rejects.toThrow(/no summary/);
  });
});
