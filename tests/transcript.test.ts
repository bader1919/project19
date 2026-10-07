import { describe, it, expect, vi } from "vitest";
import { fromSupadata, fromYoutubeTranscriptIo, getTranscript, segmentsToText } from "../server/transcript";
import type { CaptionTrack } from "../server/youtube";

const ID = "dQw4w9WgXcQ";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const asFetch = (f: unknown) => f as typeof fetch;

describe("fromSupadata", () => {
  it("converts ms to seconds and sends api key", async () => {
    const f = vi.fn(async () =>
      json({ lang: "en", content: [{ text: " Hi ", offset: 1500, duration: 2500 }, { text: "  ", offset: 0, duration: 1 }] }),
    );
    const r = await fromSupadata(ID, "KEY", asFetch(f));
    expect(r).toEqual({ segments: [{ start: 1.5, dur: 2.5, text: "Hi" }], lang: "en", source: "supadata" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("api.supadata.ai/v1/transcript?url=");
    expect(url).toContain(encodeURIComponent(`https://www.youtube.com/watch?v=${ID}`));
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("KEY");
  });

  it("falls back to chunk lang", async () => {
    const f = vi.fn(async () => json({ content: [{ text: "x", offset: 0, duration: 1000, lang: "ar" }] }));
    expect((await fromSupadata(ID, "K", asFetch(f))).lang).toBe("ar");
  });

  it("polls a 202 job until complete", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ jobId: "j1" }, 202))
      .mockResolvedValueOnce(json({ status: "active" }))
      .mockResolvedValueOnce(json({ status: "completed", content: [{ text: "done", offset: 2000, duration: 1000 }], lang: "en" }));
    const r = await fromSupadata(ID, "K", asFetch(f), 1);
    expect(r.segments).toEqual([{ start: 2, dur: 1, text: "done" }]);
    expect(f).toHaveBeenCalledTimes(3);
    expect((f.mock.calls[1] as unknown[])[0]).toBe("https://api.supadata.ai/v1/transcript/j1");
  });

  it("throws when the job failed", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ jobId: "j1" }, 202))
      .mockResolvedValueOnce(json({ status: "failed", error: "boom" }));
    await expect(fromSupadata(ID, "K", asFetch(f), 1)).rejects.toThrow(/job failed.*boom/);
  });

  it("gives up after maxPolls", async () => {
    const f = vi.fn(async (u: string) => (u.includes("/transcript/") ? json({ status: "active" }) : json({ jobId: "j" }, 202)));
    await expect(fromSupadata(ID, "K", asFetch(f), 1, 2)).rejects.toThrow(/still processing/);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("throws on 200 with no content and no jobId", async () => {
    const f = vi.fn(async () => json({}));
    await expect(fromSupadata(ID, "K", asFetch(f))).rejects.toThrow(/no transcript/);
  });

  it("includes status and string error message on non-ok", async () => {
    const f = vi.fn(async () => json({ error: "limit-exceeded" }, 429));
    await expect(fromSupadata(ID, "K", asFetch(f))).rejects.toThrow("Supadata 429: limit-exceeded");
  });

  it("includes object error message and tolerates non-JSON body", async () => {
    await expect(fromSupadata(ID, "K", asFetch(async () => json({ error: { message: "bad key" } }, 401)))).rejects.toThrow("Supadata 401: bad key");
    await expect(fromSupadata(ID, "K", asFetch(async () => new Response("oops", { status: 500 })))).rejects.toThrow("Supadata 500");
  });
});

describe("fromYoutubeTranscriptIo", () => {
  const tracks = (...t: { language?: string; transcript?: { text: string; start: string | number; dur: string | number }[] }[]) => [{ tracks: t }];
  const seg = (text: string) => [{ text, start: "1.5", dur: "2" }];

  it("sends Basic auth, POSTs ids, converts string times", async () => {
    const f = vi.fn(async () => json(tracks({ language: "English", transcript: [{ text: " a ", start: "1.5", dur: "2.25" }] })));
    const r = await fromYoutubeTranscriptIo(ID, "TOK", asFetch(f));
    expect(r).toEqual({ segments: [{ start: 1.5, dur: 2.25, text: "a" }], lang: "English", source: "youtube-transcript.io" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.youtube-transcript.io/api/transcripts");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Basic TOK");
    expect(JSON.parse(init.body as string)).toEqual({ ids: [ID] });
  });

  it("prefers Arabic, then English, then first", async () => {
    const mk = (...langs: string[]) => asFetch(async () => json(tracks(...langs.map((l) => ({ language: l, transcript: seg(l) })))));
    expect((await fromYoutubeTranscriptIo(ID, "k", mk("English", "Arabic"))).segments[0].text).toBe("Arabic");
    expect((await fromYoutubeTranscriptIo(ID, "k", mk("German", "English"))).segments[0].text).toBe("English");
    expect((await fromYoutubeTranscriptIo(ID, "k", mk("German", "French"))).segments[0].text).toBe("German");
    expect((await fromYoutubeTranscriptIo(ID, "k", mk("fr", "ar"))).segments[0].text).toBe("ar");
  });

  it("throws on empty transcript or no tracks", async () => {
    await expect(fromYoutubeTranscriptIo(ID, "k", asFetch(async () => json(tracks({ language: "en", transcript: [{ text: " ", start: 0, dur: 1 }] }))))).rejects.toThrow(/no transcript/);
    await expect(fromYoutubeTranscriptIo(ID, "k", asFetch(async () => json([{}])))).rejects.toThrow(/no transcript/);
    await expect(fromYoutubeTranscriptIo(ID, "k", asFetch(async () => json([])))).rejects.toThrow(/no transcript/);
  });

  it("throws with status on non-ok", async () => {
    await expect(fromYoutubeTranscriptIo(ID, "k", asFetch(async () => json({}, 403)))).rejects.toThrow("youtube-transcript.io 403");
  });
});

describe("getTranscript", () => {
  const track: CaptionTrack = { baseUrl: "https://www.youtube.com/api/timedtext?v=x&lang=en", languageCode: "en" };
  const xml = '<transcript><text start="1" dur="2">Hello</text></transcript>';
  const route = (handlers: { yt?: () => Response; sup?: () => Response; io?: () => Response }) =>
    vi.fn(async (u: string | URL | Request) => {
      const url = String(u);
      if (url.includes("timedtext")) return handlers.yt!();
      if (url.includes("supadata")) return handlers.sup!();
      if (url.includes("youtube-transcript.io")) return handlers.io!();
      throw new Error("unexpected " + url);
    });
  const supOk = () => json({ lang: "en", content: [{ text: "sup", offset: 0, duration: 1000 }] });
  const ioOk = () => json([{ tracks: [{ language: "en", transcript: [{ text: "io", start: "0", dur: "1" }] }] }]);

  it("uses youtube first and does not call paid sources", async () => {
    const f = route({ yt: () => new Response(xml), sup: supOk, io: ioOk });
    const { result, attempts } = await getTranscript(ID, [track], { supadata_key: "s", ytio_key: "i" }, asFetch(f));
    expect(result?.source).toBe("youtube");
    expect(result?.segments).toEqual([{ start: 1, dur: 2, text: "Hello" }]);
    expect(attempts).toEqual([]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("falls to supadata when youtube fails, recording the attempt", async () => {
    const f = route({ yt: () => new Response("x", { status: 429 }), sup: supOk, io: ioOk });
    const { result, attempts } = await getTranscript(ID, [track], { supadata_key: "s", ytio_key: "i" }, asFetch(f));
    expect(result?.source).toBe("supadata");
    expect(attempts).toHaveLength(1);
    expect(attempts[0].source).toBe("youtube");
    expect(attempts[0].error).toMatch(/429/);
  });

  it("falls through to youtube-transcript.io", async () => {
    const f = route({ yt: () => new Response("x", { status: 500 }), sup: () => json({ error: "no" }, 500), io: ioOk });
    const { result, attempts } = await getTranscript(ID, [track], { supadata_key: "s", ytio_key: "i" }, asFetch(f));
    expect(result?.source).toBe("youtube-transcript.io");
    expect(attempts.map((a) => a.source)).toEqual(["youtube", "supadata"]);
  });

  it("skips sources without keys or tracks", async () => {
    const f = route({ sup: supOk, io: ioOk });
    const a = await getTranscript(ID, [], { ytio_key: "i" }, asFetch(f));
    expect(a.result?.source).toBe("youtube-transcript.io");
    expect(a.attempts).toEqual([]);
    expect(f.mock.calls.map((c) => String((c as unknown[])[0])).every((u) => u.includes("youtube-transcript.io"))).toBe(true);

    const b = await getTranscript(ID, [], { supadata_key: null, ytio_key: "" }, asFetch(f));
    expect(b).toEqual({ result: null, attempts: [] });
  });

  it("returns null result with all attempts when everything fails", async () => {
    const f = route({ yt: () => new Response("x", { status: 500 }), sup: () => json({}, 500), io: () => json({}, 500) });
    const { result, attempts } = await getTranscript(ID, [track], { supadata_key: "s", ytio_key: "i" }, asFetch(f));
    expect(result).toBeNull();
    expect(attempts.map((a) => a.source)).toEqual(["youtube", "supadata", "youtube-transcript.io"]);
    expect(attempts.every((a) => a.error.length > 0)).toBe(true);
  });
});

describe("segmentsToText", () => {
  it("joins, collapses whitespace and trims", () => {
    expect(segmentsToText([{ start: 0, dur: 1, text: " a  b " }, { start: 1, dur: 1, text: "c\nd" }])).toBe("a b c d");
  });
  it("returns empty string for no segments", () => {
    expect(segmentsToText([])).toBe("");
  });
});
