import { describe, it, expect, vi } from "vitest";
import {
  extractJsonAfter,
  metaFromPlayer,
  pickCaptionTrack,
  decodeEntities,
  parseTimedText,
  fetchVideo,
  downloadCaptionTrack,
  type CaptionTrack,
} from "../server/youtube";

const ID = "dQw4w9WgXcQ";
const tr = (languageCode: string, kind?: string, extra: Partial<CaptionTrack> = {}): CaptionTrack => ({
  baseUrl: `https://www.youtube.com/api/timedtext?v=${ID}&lang=${languageCode}${kind ? "&kind=" + kind : ""}`,
  languageCode,
  kind,
  ...extra,
});

describe("extractJsonAfter", () => {
  it("extracts a simple object", () => {
    expect(extractJsonAfter('var x = {"a":1};', "var x")).toEqual({ a: 1 });
  });
  it("handles nested braces", () => {
    expect(extractJsonAfter('foo = {"a":{"b":{"c":[1,{"d":2}]}},"e":3}; trailing {"z":1}', "foo")).toEqual({
      a: { b: { c: [1, { d: 2 }] } },
      e: 3,
    });
  });
  it("ignores braces inside strings", () => {
    expect(extractJsonAfter('m = {"a":"}{ not real }","b":"{"};', "m =")).toEqual({ a: "}{ not real }", b: "{" });
  });
  it("handles escaped quotes and backslashes", () => {
    const json = '{"a":"he said \\"}\\" ok","b":"back\\\\","c":1}';
    expect(extractJsonAfter(`m = ${json};`, "m")).toEqual(JSON.parse(json));
  });
  it("returns null if marker missing, no object, unterminated or invalid", () => {
    expect(extractJsonAfter("nothing", "m")).toBeNull();
    expect(extractJsonAfter("m = 5;", "m")).toBeNull();
    expect(extractJsonAfter('m = {"a":1', "m")).toBeNull();
    expect(extractJsonAfter("m = {a:1};", "m")).toBeNull();
  });
  it("starts at the first brace after the marker", () => {
    expect(extractJsonAfter('{"early":1} marker {"late":2}', "marker")).toEqual({ late: 2 });
  });
});

describe("metaFromPlayer", () => {
  it("maps videoDetails + microformat", () => {
    const meta = metaFromPlayer(ID, {
      videoDetails: {
        title: "عنوان الفيديو",
        author: "Chan",
        channelId: "UC123",
        shortDescription: "desc",
        lengthSeconds: "212",
        thumbnail: { thumbnails: [{ url: "small" }, { url: "big" }] },
      },
      microformat: { playerMicroformatRenderer: { publishDate: "2024-03-05T10:00:00-07:00" } },
    });
    expect(meta).toEqual({
      youtube_id: ID,
      title: "عنوان الفيديو",
      channel: "Chan",
      channel_url: "https://www.youtube.com/channel/UC123",
      description: "desc",
      thumbnail: "big",
      published_at: "2024-03-05",
      duration_sec: 212,
    });
  });
  it("falls back to microformat fields", () => {
    const meta = metaFromPlayer(ID, {
      microformat: {
        playerMicroformatRenderer: {
          title: { simpleText: "MF title" },
          ownerChannelName: "Owner",
          ownerProfileUrl: "http://www.youtube.com/@owner",
          description: { simpleText: "MF desc" },
          lengthSeconds: "60",
          uploadDate: "2020-01-02",
          thumbnail: { thumbnails: [{ url: "mf-thumb" }] },
        },
      },
    });
    expect(meta).toMatchObject({
      title: "MF title", channel: "Owner", channel_url: "http://www.youtube.com/@owner",
      description: "MF desc", thumbnail: "mf-thumb", published_at: "2020-01-02", duration_sec: 60,
    });
  });
  it("uses defaults for an empty player", () => {
    const meta = metaFromPlayer(ID, {});
    expect(meta).toMatchObject({
      title: "", channel: null, channel_url: null, description: "",
      thumbnail: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`, published_at: null, duration_sec: null,
    });
  });
  it("rejects bad dates and zero/NaN durations", () => {
    const meta = metaFromPlayer(ID, {
      videoDetails: { lengthSeconds: "0" },
      microformat: { playerMicroformatRenderer: { publishDate: "garbage" } },
    });
    expect(meta.published_at).toBeNull();
    expect(meta.duration_sec).toBeNull();
  });
  it("joins runs for description text", () => {
    const meta = metaFromPlayer(ID, {
      microformat: { playerMicroformatRenderer: { description: { runs: [{ text: "a" }, { text: "b" }] } } },
    });
    expect(meta.description).toBe("ab");
  });
});

describe("pickCaptionTrack", () => {
  it("returns null for no tracks", () => {
    expect(pickCaptionTrack([])).toBeNull();
  });
  it("asr Arabic + manual Arabic -> manual Arabic", () => {
    const manual = tr("ar");
    expect(pickCaptionTrack([tr("ar", "asr"), manual])).toBe(manual);
    expect(pickCaptionTrack([manual, tr("ar", "asr")])).toBe(manual);
  });
  it("matches manual by base language (ar-SA vs ar)", () => {
    const manual = tr("ar-SA");
    expect(pickCaptionTrack([tr("ar", "asr"), manual])).toBe(manual);
  });
  it("asr only -> asr", () => {
    const asr = tr("ar", "asr");
    expect(pickCaptionTrack([asr])).toBe(asr);
  });
  it("asr Arabic + manual English only -> asr (spoken language)", () => {
    const asr = tr("ar", "asr");
    expect(pickCaptionTrack([tr("en"), asr])).toBe(asr);
  });
  it("no asr: prefers ar then en", () => {
    const ar = tr("ar"), en = tr("en"), fr = tr("fr");
    expect(pickCaptionTrack([fr, en, ar])).toBe(ar);
    expect(pickCaptionTrack([fr, en])).toBe(en);
  });
  it("respects custom preferred order", () => {
    const ar = tr("ar"), en = tr("en");
    expect(pickCaptionTrack([ar, en], ["en", "ar"])).toBe(en);
  });
  it("falls back to first manual track, then first track", () => {
    const fr = tr("fr"), de = tr("de");
    expect(pickCaptionTrack([fr, de])).toBe(fr);
  });
});

describe("decodeEntities", () => {
  it.each([
    ["&amp;", "&"],
    ["&lt;b&gt;", "<b>"],
    ["&quot;hi&quot;", '"hi"'],
    ["&apos;", "'"],
    ["&#39;", "'"],
    ["&#x27;", "'"],
    ["&#X27;", "'"],
    ["&amp;#39;", "'"], // double encoded
    ["don&amp;#39;t", "don't"],
    ["&amp;quot;x&amp;quot;", '"x"'],
    ["&nbsp;", " "],
    ["&#1575;&#1604;", "ال"],
    ["&unknown;", "&unknown;"],
    ["plain", "plain"],
    ["Tom &amp; Jerry", "Tom & Jerry"],
  ])("%j -> %j", (a, b) => expect(decodeEntities(a)).toBe(b));
});

describe("parseTimedText", () => {
  it("parses classic <text start dur> format", () => {
    const xml = `<?xml version="1.0" encoding="utf-8" ?><transcript>
<text start="0.5" dur="2.25">Hello &amp;amp; welcome</text>
<text start="3" dur="1.5">it&amp;#39;s great</text>
<text start="5" dur="1">   </text>
<text start="6" dur="1"></text>
<text start="7.5" dur="2">مرحبا\nبكم</text>
</transcript>`;
    expect(parseTimedText(xml)).toEqual([
      { start: 0.5, dur: 2.25, text: "Hello & welcome" },
      { start: 3, dur: 1.5, text: "it's great" },
      { start: 7.5, dur: 2, text: "مرحبا بكم" },
    ]);
  });

  it("parses srv3 <p t d> format with nested <s> tags", () => {
    const xml = `<?xml version="1.0" encoding="utf-8" ?><timedtext format="3"><body>
<p t="1500" d="2500" w="1"><s>Hello</s><s t="400" ac="0"> brave</s><s t="800"> world</s></p>
<p t="4000" d="1000"></p>
<p t="5000" d="500"><s> </s></p>
<p t="6000" d="2000">Line one
line two &amp;amp; more</p>
</body></timedtext>`;
    expect(parseTimedText(xml)).toEqual([
      { start: 1.5, dur: 2.5, text: "Hello brave world" },
      { start: 6, dur: 2, text: "Line one line two & more" },
    ]);
  });

  it("defaults missing attributes to 0", () => {
    expect(parseTimedText("<transcript><text>x</text></transcript>")).toEqual([{ start: 0, dur: 0, text: "x" }]);
  });

  it("returns [] for junk/empty", () => {
    expect(parseTimedText("")).toEqual([]);
    expect(parseTimedText("<html>blocked</html>")).toEqual([]);
  });

  it("prefers classic when both present", () => {
    const out = parseTimedText('<text start="1" dur="1">A</text><p t="2000" d="1000">B</p>');
    expect(out.map((s) => s.text)).toEqual(["A"]);
  });
});

// ---------- fetchVideo ----------

const playerResponse = {
  videoDetails: {
    videoId: ID,
    title: "Great Talk",
    author: "Speaker",
    channelId: "UCabc",
    shortDescription: "Links:\nhttps://example.com",
    lengthSeconds: "300",
    thumbnail: { thumbnails: [{ url: "t1" }, { url: "t2" }] },
  },
  microformat: { playerMicroformatRenderer: { publishDate: "2023-11-20" } },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [{ baseUrl: "https://page/tt?lang=en", languageCode: "en", name: { simpleText: "English" } }],
    },
  },
};
const watchHtml = (player: unknown = playerResponse, key = "abc") =>
  `<html><head><script>ytcfg.set({"INNERTUBE_API_KEY":"${key}","X":1});</script></head><body>` +
  `<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};var meta = {};</script></body></html>`;

const apiPlayer = {
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        { baseUrl: "https://api/tt?lang=ar&kind=asr", languageCode: "ar", kind: "asr", name: { runs: [{ text: "Arabic " }, { text: "(auto)" }] } },
        { baseUrl: "https://api/tt?lang=ar", languageCode: "ar", name: { simpleText: "Arabic" } },
        { notAUrl: true, languageCode: "xx" },
      ],
    },
  },
};

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });

describe("fetchVideo", () => {
  it("(a) page + InnerTube player API -> meta and API tracks", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.includes("/watch?")) return new Response(watchHtml(), { status: 200 });
      if (u.includes("youtubei/v1/player")) return json(apiPlayer);
      throw new Error("unexpected " + u);
    });
    const res = await fetchVideo(ID, fetchImpl as unknown as typeof fetch);
    expect(res.meta).toEqual({
      youtube_id: ID,
      title: "Great Talk",
      channel: "Speaker",
      channel_url: "https://www.youtube.com/channel/UCabc",
      description: "Links:\nhttps://example.com",
      thumbnail: "t2",
      published_at: "2023-11-20",
      duration_sec: 300,
    });
    expect(res.captionTracks).toEqual([
      { baseUrl: "https://api/tt?lang=ar&kind=asr", languageCode: "ar", kind: "asr", name: "Arabic (auto)" },
      { baseUrl: "https://api/tt?lang=ar", languageCode: "ar", kind: undefined, name: "Arabic" },
    ]);
    expect(res.captionsError).toBeUndefined();

    const post = calls.find((c) => c.url.includes("youtubei"))!;
    expect(post.url).toContain("key=abc");
    expect(post.init?.method).toBe("POST");
    const body = JSON.parse(String(post.init?.body));
    expect(body.videoId).toBe(ID);
    expect(body.context.client.clientName).toBe("ANDROID");
  });

  it("(b) page fetch fails -> oEmbed fallback with captionsError", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/oembed")) {
        return json({ title: "Oembed Title", author_name: "Auth", author_url: "https://www.youtube.com/@auth", thumbnail_url: "https://thumb" });
      }
      return new Response("nope", { status: 429 });
    });
    const res = await fetchVideo(ID, fetchImpl as unknown as typeof fetch);
    expect(res.captionTracks).toEqual([]);
    expect(res.captionsError).toBeTruthy();
    expect(res.meta).toEqual({
      youtube_id: ID, title: "Oembed Title", channel: "Auth", channel_url: "https://www.youtube.com/@auth",
      description: "", thumbnail: "https://thumb", published_at: null, duration_sec: null,
    });
  });

  it("(b2) page fetch throws -> oEmbed fallback", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/oembed")) return json({ title: "T" });
      throw new TypeError("network down");
    });
    const res = await fetchVideo(ID, fetchImpl as unknown as typeof fetch);
    expect(res.meta.title).toBe("T");
    expect(res.meta.thumbnail).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
    expect(res.captionTracks).toEqual([]);
  });

  it("(b3) page without a player response also falls back to oEmbed", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/oembed") ? json({ title: "T2" }) : new Response("<html>consent</html>"));
    const res = await fetchVideo(ID, fetchImpl as unknown as typeof fetch);
    expect(res.meta.title).toBe("T2");
    expect(res.captionsError).toBeTruthy();
  });

  it("(b4) oEmbed failing too rejects with a helpful error", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 404 }));
    await expect(fetchVideo(ID, fetchImpl as unknown as typeof fetch)).rejects.toThrow(/404/);
  });

  it("(c) player API fails -> falls back to the page's captionTracks", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/watch?")) return new Response(watchHtml(), { status: 200 });
      return new Response("err", { status: 500 });
    });
    const res = await fetchVideo(ID, fetchImpl as unknown as typeof fetch);
    expect(res.captionTracks).toEqual([
      { baseUrl: "https://page/tt?lang=en", languageCode: "en", kind: undefined, name: "English" },
    ]);
    expect(res.captionsError).toBeUndefined();
  });

  it("(c2) player API throws -> falls back to page tracks", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/watch?")) return new Response(watchHtml());
      throw new Error("reset");
    });
    const res = await fetchVideo(ID, fetchImpl as unknown as typeof fetch);
    expect(res.captionTracks).toHaveLength(1);
  });

  it("no captions anywhere -> captionsError set", async () => {
    const noCaps = { ...playerResponse, captions: undefined };
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/watch?")) return new Response(watchHtml(noCaps));
      return json({});
    });
    const res = await fetchVideo(ID, fetchImpl as unknown as typeof fetch);
    expect(res.captionTracks).toEqual([]);
    expect(res.captionsError).toMatch(/no captions/i);
  });

  it("no captions and API error -> reports the API error", async () => {
    const noCaps = { ...playerResponse, captions: undefined };
    const fetchImpl = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/watch?") ? new Response(watchHtml(noCaps)) : new Response("", { status: 403 }));
    const res = await fetchVideo(ID, fetchImpl as unknown as typeof fetch);
    expect(res.captionsError).toContain("403");
  });

  it("no INNERTUBE_API_KEY -> never calls the API, uses page tracks", async () => {
    const html = `<script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script>`;
    const fetchImpl = vi.fn(async () => new Response(html));
    const res = await fetchVideo(ID, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.captionTracks).toHaveLength(1);
  });
});

describe("downloadCaptionTrack", () => {
  it("strips &fmt= from the url and parses the body", async () => {
    const fetchImpl = vi.fn(async () => new Response('<transcript><text start="1" dur="2">Hi</text></transcript>'));
    const segs = await downloadCaptionTrack(
      { baseUrl: "https://www.youtube.com/api/timedtext?v=x&fmt=srv3&lang=en", languageCode: "en" },
      fetchImpl as unknown as typeof fetch,
    );
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe("https://www.youtube.com/api/timedtext?v=x&lang=en");
    expect(segs).toEqual([{ start: 1, dur: 2, text: "Hi" }]);
  });

  it("strips fmt at the end of the url too", async () => {
    const fetchImpl = vi.fn(async () => new Response("<transcript><text>a</text></transcript>"));
    await downloadCaptionTrack({ baseUrl: "https://t/tt?lang=en&fmt=json3", languageCode: "en" }, fetchImpl as unknown as typeof fetch);
    expect((fetchImpl.mock.calls[0] as unknown[])[0]).toBe("https://t/tt?lang=en");
  });

  it("errors on empty / whitespace body", async () => {
    const f = vi.fn(async () => new Response("  \n"));
    await expect(downloadCaptionTrack({ baseUrl: "https://t/tt", languageCode: "en" }, f as unknown as typeof fetch)).rejects.toThrow(/empty caption/i);
  });

  it("errors on non-OK status", async () => {
    const f = vi.fn(async () => new Response("x", { status: 429 }));
    await expect(downloadCaptionTrack({ baseUrl: "https://t/tt", languageCode: "en" }, f as unknown as typeof fetch)).rejects.toThrow(/429/);
  });
});

describe("parseTimedText self-closing elements", () => {
  it("does not swallow the next cue after a self-closing <text/>", () => {
    const xml = '<transcript><text start="1" dur="1"/><text start="2" dur="3">Hello</text><text start="5" dur="1"/></transcript>';
    expect(parseTimedText(xml)).toEqual([{ start: 2, dur: 3, text: "Hello" }]);
  });

  it("does not swallow the next cue after a self-closing srv3 <p/>", () => {
    const xml = '<timedtext><body><p t="1000" d="1000"/><p t="2000" d="3000">World</p><p t="5000" d="1000"/></body></timedtext>';
    expect(parseTimedText(xml)).toEqual([{ start: 2, dur: 3, text: "World" }]);
  });
});
