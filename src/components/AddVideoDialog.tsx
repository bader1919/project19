import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardPaste, Loader2 } from "lucide-react";
import { parseYouTubeId } from "../../shared/youtube-url";
import { api, type IngestResult } from "../lib/api";
import { Sheet } from "./Sheet";
import { Thumb } from "./Thumb";
import { ErrorBox } from "./ui";

/** Pull the first YouTube URL out of shared text like "Check this out https://youtu.be/xyz". */
function firstYouTubeUrl(text: string): string {
  const urls = text.match(/https?:\/\/\S+/g) ?? [];
  return urls.find((u) => parseYouTubeId(u)) ?? text.trim();
}

/**
 * Save-a-video surface (bottom sheet on phones, centred dialog on desktop). Also opened by the PWA share target
 * (/add?url=...) with `initialText` prefilled.
 */
export function AddVideoDialog({ initialText, onClose }: { initialText?: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState(() => (initialText ? firstYouTubeUrl(initialText) : ""));
  const [transcript, setTranscript] = useState("");
  const [description, setDescription] = useState("");
  const [showPaste, setShowPaste] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlTouched, setUrlTouched] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const videoId = useMemo(() => parseYouTubeId(url), [url]);
  const canReadClipboard = typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText);

  async function save() {
    if (!videoId) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api<IngestResult>("/ingest", { body: { url, transcript: transcript.trim() || undefined, description: description.trim() || undefined } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(firstYouTubeUrl(text));
    } catch {
      /* permission denied: the field still accepts a normal paste */
    }
  }

  return (
    <Sheet title="Save a video" onClose={onClose} dismissible={!busy}>
      {!result ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div>
            <label htmlFor="yt-url" className="mb-1 block text-meta font-semibold text-ink-2">Video link</label>
            <input
              id="yt-url"
              data-autofocus
              className="input"
              inputMode="url"
              autoComplete="off"
              placeholder="https://youtube.com/watch?v=…"
              value={url}
              onChange={(e) => { setUrl(e.target.value); if ((e.nativeEvent as InputEvent).inputType === "insertFromPaste") setUrlTouched(true); }}
              onFocus={() => setUrlTouched(false)}
              onBlur={() => setUrlTouched(true)}
              aria-invalid={urlTouched && url && !videoId ? true : undefined}
            />
            {url && !videoId && (urlTouched || initialText) ? (
              <p className="mt-1.5 text-meta text-danger" role="alert">
                Couldn't save this link. It isn't a YouTube video URL. Paste a link like youtube.com/watch?v=…
              </p>
            ) : (
              !url && canReadClipboard && (
                <button type="button" className="mt-1.5 inline-flex min-h-[44px] items-center gap-1.5 text-meta text-binding hover:underline sm:min-h-[32px]" onClick={pasteFromClipboard}>
                  <ClipboardPaste className="h-4 w-4" aria-hidden="true" /> Paste from clipboard
                </button>
              )
            )}
          </div>

          {videoId && <Thumb src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} title={url} className="aspect-video w-full" />}

          {showPaste ? (
            <div className="space-y-3">
              <div>
                <label htmlFor="yt-description" className="mb-1 block text-meta font-semibold text-ink-2">Description (optional)</label>
                <textarea
                  id="yt-description"
                  dir="auto"
                  className="input h-28"
                  placeholder="Paste the text under the video on YouTube (… more). Its links are saved too."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="yt-transcript" className="mb-1 block text-meta font-semibold text-ink-2">Transcript (optional)</label>
                <textarea
                  id="yt-transcript"
                  dir="auto"
                  className="input h-32"
                  placeholder="On YouTube: … more → Show transcript, select all lines, copy, paste here. Timestamps are kept."
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <button type="button" className="inline-flex min-h-[44px] items-center text-meta text-binding hover:underline sm:min-h-[32px]" onClick={() => setShowPaste(true)}>
              Paste the description and transcript
            </button>
          )}

          {error && <ErrorBox message={error} />}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!videoId || busy}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…</> : "Save video"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4" role="status">
          <div>
            <p dir="auto" className="font-serif text-lg font-semibold leading-snug">{result.title}</p>
            <p className="mt-1 text-body text-ink-2">
              {result.already_saved
                ? "Already in your library."
                : `Saved. Details fill in over the next minute. ${result.link_count} link${result.link_count === 1 ? "" : "s"} found${
                    result.transcript_source ? `, transcript from ${result.transcript_source}.` : "; the transcript is fetched in the background."
                  }`}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => { setResult(null); setUrl(""); setTranscript(""); setDescription(""); }}>Save another</button>
            <button autoFocus className="btn-primary" onClick={() => { onClose(); navigate(`/item/${result.item_id}`); }}>Open video</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
