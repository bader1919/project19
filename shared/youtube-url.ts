const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Extract the 11-character video id from any common YouTube URL form (or a bare id). */
export function parseYouTubeId(input: string): string | null {
  const raw = input.trim();
  if (ID_RE.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, "").toLowerCase();

  if (host === "youtu.be") {
    const id = url.pathname.split("/")[1] ?? "";
    return ID_RE.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && ID_RE.test(v)) return v;
    const m = url.pathname.match(/^\/(?:shorts|live|embed|v|e)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

export function formatTimestamp(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}
