import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { parseYouTubeId } from "../../shared/youtube-url";
import { api, type IngestResult } from "../lib/api";

/** Pull the first YouTube URL out of shared text like "Check this out https://youtu.be/xyz". */
function firstYouTubeUrl(text: string): string {
  const urls = text.match(/https?:\/\/\S+/g) ?? [];
  return urls.find((u) => parseYouTubeId(u)) ?? text.trim();
}

export function AddVideoDialog({ initialText, onClose }: { initialText?: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState(() => (initialText ? firstYouTubeUrl(initialText) : ""));
  const [transcript, setTranscript] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoId = useMemo(() => parseYouTubeId(url), [url]);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function save() {
    if (!videoId) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api<IngestResult>("/api/ingest", { body: { url, transcript: transcript || undefined } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-[10vh]" role="dialog" aria-modal="true" aria-labelledby="add-title">
      <div className="card w-full max-w-lg p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="add-title" className="text-lg font-semibold">Save a YouTube video</h2>
          <button className="btn-ghost p-1.5" onClick={onClose} disabled={busy} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!result ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div>
              <label htmlFor="yt-url" className="mb-1 block text-sm font-medium">Video link</label>
              <input
                ref={inputRef}
                id="yt-url"
                className="input"
                placeholder="https://www.youtube.com/watch?v=… or youtu.be/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              {url && !videoId && <p className="mt-1 text-xs text-red-600">That doesn't look like a YouTube video link.</p>}
            </div>

            {videoId && (
              <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" className="aspect-video w-full rounded-lg object-cover" />
            )}

            {showPaste ? (
              <div>
                <label htmlFor="yt-transcript" className="mb-1 block text-sm font-medium">Transcript (optional)</label>
                <textarea
                  id="yt-transcript"
                  dir="auto"
                  className="input h-32"
                  placeholder="Paste the transcript here if automatic fetching fails"
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                />
              </div>
            ) : (
              <button type="button" className="text-xs text-brand-600 hover:underline" onClick={() => setShowPaste(true)}>
                I already have the transcript — paste it
              </button>
            )}

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={!videoId || busy}>
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Fetching transcript & links…</> : "Save video"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-3">
              {result.transcript_source || result.already_saved ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              ) : (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              )}
              <div className="text-sm">
                <p dir="auto" className="font-medium">{result.title}</p>
                <p className="mt-1 text-slate-500">
                  {result.already_saved
                    ? "Already in your library."
                    : `Saved with ${result.link_count} link${result.link_count === 1 ? "" : "s"}. ${
                        result.transcript_source ? `Transcript from ${result.transcript_source}.` : "Transcript could not be fetched yet."
                      }`}
                </p>
                {!result.already_saved && !result.transcript_source && result.transcript_errors.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-slate-500">
                    {result.transcript_errors.map((e, i) => <li key={i}>{e.source}: {e.error}</li>)}
                  </ul>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-100">
              Next: ask Claude <em>“Analyze my pending RefVault videos”</em> to add the summary, topics and link labels.
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => { setResult(null); setUrl(""); setTranscript(""); }}>Save another</button>
              <button className="btn-primary" onClick={() => { onClose(); navigate(`/item/${result.item_id}`); }}>Open</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
