// Recorded-style YouTube responses for offline end-to-end tests.
export const VIDEOS = {
  e2eENvid001: {
    title: "Build a RAG app with Postgres and pgvector",
    author: "Dev Channel",
    channelId: "UCdev",
    lengthSeconds: "754",
    publishDate: "2025-03-14",
    description: [
      "In this video we build a retrieval app step by step.",
      "",
      "Links:",
      "pgvector repo: https://github.com/pgvector/pgvector",
      "Supabase docs -> https://supabase.com/docs/guides/ai",
      "My course (50% off with code RAG50):",
      "https://bit.ly/rag-course",
      "",
      "00:00 Intro",
      "01:30 Installing pgvector",
      "07:45 Building the search",
    ].join("\n"),
    captions: [
      { lang: "en", kind: "asr", cues: [[0, 3, "hey everyone welcome back"], [3.5, 4, "today we build a rag app with postgres"], [95, 5, "first install pgvector from github.com/pgvector"], [470, 6, "check the langchain docs at https://python.langchain.com for more"], [600, 5, "I also recommend the book Designing Data-Intensive Applications"]] },
    ],
  },
  e2eARvid001: {
    title: "شرح أدوات الذكاء الاصطناعي للمبتدئين",
    author: "قناة التقنية",
    channelId: "UCar",
    lengthSeconds: "1260",
    publishDate: "2025-05-02",
    description: "في هذا الفيديو نشرح أفضل أدوات الذكاء الاصطناعي.\nموقع الأداة: https://ollama.com،\nحسابي على تويتر https://x.com/arabtech",
    captions: [
      { lang: "en", kind: undefined, cues: [[0, 4, "In this video we explain AI tools"]] },
      { lang: "ar", kind: "asr", cues: [[0, 4, "السلام عليكم ومرحبا بكم"], [30, 5, "اليوم نتحدث عن أدوات الذكاء الاصطناعي"], [300, 6, "أنصح بتجربة أداة أولاما على جهازك"]] },
      { lang: "ar", kind: undefined, cues: [[0, 4, "السلام عليكم ومرحباً بكم"], [30, 5, "اليوم نتحدث عن أدوات الذكاء الاصطناعي"], [300, 6, "أنصح بتجربة أداة أولاما على جهازك"]] },
    ],
  },
  e2eNOcaps01: {
    title: "A video without captions",
    author: "Quiet Channel",
    channelId: "UCquiet",
    lengthSeconds: "60",
    publishDate: "2024-01-01",
    description: "No links here.",
    captions: [],
  },
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&amp;#39;");

function player(id) {
  const v = VIDEOS[id];
  return {
    videoDetails: {
      videoId: id, title: v.title, author: v.author, channelId: v.channelId, lengthSeconds: v.lengthSeconds,
      shortDescription: v.description, thumbnail: { thumbnails: [{ url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }] },
    },
    microformat: { playerMicroformatRenderer: { publishDate: v.publishDate } },
    captions: v.captions.length
      ? {
          playerCaptionsTracklistRenderer: {
            captionTracks: v.captions.map((c, i) => ({
              baseUrl: `https://www.youtube.com/api/timedtext?v=${id}&lang=${c.lang}&idx=${i}&fmt=srv3`,
              languageCode: c.lang,
              ...(c.kind ? { kind: c.kind } : {}),
              name: { simpleText: c.lang },
            })),
          },
        }
      : undefined,
  };
}

/** Wraps the real fetch: YouTube URLs are answered from fixtures, everything else passes through. */
export function installFakeYouTube(realFetch = globalThis.fetch) {
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (!/(^|\.)youtube\.com$|^bit\.ly$/.test(url.hostname)) return realFetch(input, init);

    if (url.hostname === "bit.ly") {
      return new Response(null, { status: 301, headers: { location: "https://courses.example.com/rag?ref=yt" } });
    }
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v");
      if (!VIDEOS[id]) return new Response("not found", { status: 404 });
      const html = `<html><script>var ytInitialPlayerResponse = ${JSON.stringify(player(id))};</script><script>ytcfg.set({"INNERTUBE_API_KEY":"fake-key"});</script></html>`;
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }
    if (url.pathname === "/youtubei/v1/player") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return Response.json(player(body.videoId));
    }
    if (url.pathname === "/api/timedtext") {
      const v = VIDEOS[url.searchParams.get("v")];
      const track = v?.captions[Number(url.searchParams.get("idx"))];
      if (!track) return new Response("", { status: 404 });
      const xml = `<?xml version="1.0" encoding="utf-8" ?><transcript>${track.cues
        .map(([s, d, t]) => `<text start="${s}" dur="${d}">${esc(t)}</text>`)
        .join("")}</transcript>`;
      return new Response(xml, { headers: { "Content-Type": "text/xml" } });
    }
    if (url.pathname === "/oembed") return new Response("", { status: 404 });
    return new Response("", { status: 404 });
  };
}
