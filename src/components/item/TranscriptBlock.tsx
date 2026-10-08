import { useMemo, useState, type ReactNode } from "react";
import { Check, Copy, RefreshCw, Search } from "lucide-react";
import { api } from "../../lib/api";
import { formatTimestamp } from "../../lib/format";
import type { ItemFull } from "../../lib/data";
import { Block, asArray, type SeekFn } from "./shared";

function Marked({ text, q }: { text: string; q: string }): ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}
    </>
  );
}

/** Shown while the transcript is missing: progress sentence, Try again, and paste. */
function MissingPanel({ item, segCount, onChanged }: { item: ItemFull; segCount: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const failed = (item.video?.auto_attempts ?? 0) >= 8;

  const retry = async (transcript?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ ok: boolean; queued?: boolean; error?: string }>("/ingest", { body: { item_id: item.id, transcript } });
      if (r.ok || r.queued) onChanged();
      if (!r.ok) setMessage(r.queued ? "Started. The transcript is being made in the background." : (r.error ?? "Still no transcript. Try again in a minute or paste it below."));
      else setPaste("");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet max-w-xl space-y-4 p-4 text-body">
      <div>
        <p role="status" className="font-medium">
          {failed ? "Couldn't get the transcript automatically." : "Getting the transcript automatically…"}
        </p>
        {!!item.video?.transcript_cursor && segCount > 0 && (
          <p className="mt-1 text-meta text-ink-2">Long video: transcribed the first {Math.round(item.video.transcript_cursor / 60)} minutes so far.</p>
        )}
        {item.error && !message && <p className="mt-1 text-meta text-ink-2">{item.error}</p>}
        <p className="mt-1 text-meta text-ink-2">
          Your PC helper (Settings) fetches YouTube's captions; when your computer is off, Gemini watches the video instead. This page updates by itself.
        </p>
      </div>
      <button type="button" className="btn-outline" onClick={() => retry()} disabled={busy} aria-busy={busy}>
        <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" /> Try again
      </button>
      <div>
        <label htmlFor="paste-transcript" className="mb-1 block text-meta font-semibold text-ink-2">Or paste the transcript</label>
        <textarea id="paste-transcript" dir="auto" className="input h-32" value={paste} onChange={(e) => setPaste(e.target.value)} />
      </div>
      <button type="button" className="btn-primary" disabled={!paste.trim() || busy} onClick={() => retry(paste)}>Save pasted transcript</button>
      {message && <p role="alert" className="border-s-4 border-danger bg-danger/10 px-3 py-2 text-meta">{message}</p>}
    </div>
  );
}

/** Transcript with find, click-a-line-to-seek and copy. `playing` is the second last sought to. */
export function TranscriptBlock({ item, playing, onSeek, onChanged }: { item: ItemFull; playing: number | null; onSeek: SeekFn; onChanged: () => void }) {
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState(false);
  const v = item.video;
  const segs = useMemo(() => asArray(v?.transcript_segments).filter((s) => s && typeof s.text === "string"), [v?.transcript_segments]);
  const q = filter.trim().toLowerCase();
  const shown = useMemo(() => {
    const all = segs.map((s, idx) => ({ s, idx }));
    return q ? all.filter(({ s }) => s.text.toLowerCase().includes(q)) : all;
  }, [segs, q]);
  const current = useMemo(() => {
    if (playing === null) return -1;
    let idx = -1;
    segs.forEach((s, i) => { if (s.start <= playing) idx = i; });
    return idx;
  }, [segs, playing]);

  if (!v?.transcript) {
    return (
      <Block id="transcript" title="Transcript">
        <MissingPanel item={item} segCount={segs.length} onChanged={onChanged} />
      </Block>
    );
  }
  const text = v.transcript;
  return (
    <Block
      id="transcript"
      title="Transcript"
      action={
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={async () => {
            try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
          }}
        >
          {copied ? <Check className="h-4 w-4 text-binding" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? "Copied" : "Copy transcript"}
        </button>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-2" aria-hidden="true" />
          <label htmlFor="find-transcript" className="sr-only">Find in transcript</label>
          <input id="find-transcript" dir="auto" type="search" className="input ps-9" placeholder="Find in transcript" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <p className="text-meta text-ink-2" aria-live="polite">
          {q ? `${shown.length} of ${segs.length} lines` : [v.transcript_source && `from ${v.transcript_source}`, v.transcript_lang].filter(Boolean).join(", ")}
        </p>
      </div>
      {segs.length ? (
        shown.length ? (
          <ol dir="auto" tabIndex={0} aria-label="Transcript lines" className="max-h-[36rem] overflow-y-auto border-t border-line">
            {shown.map(({ s, idx }) => {
              const on = idx === current;
              return (
                <li key={idx}>
                  <button
                    type="button"
                    onClick={() => onSeek(Math.floor(s.start))}
                    aria-label={`Play from ${formatTimestamp(s.start)}`}
                    className={`grid min-h-[44px] w-full grid-cols-[3.5rem_1fr] gap-3 px-2 py-1.5 text-start font-serif text-read transition-colors duration-100 hover:bg-binding-wash sm:min-h-0 ${on ? "bg-binding-wash" : ""}`}
                  >
                    <span dir="ltr" className="num pt-0.5 text-start font-sans text-meta text-ink-2">{formatTimestamp(s.start)}</span>
                    <span><Marked text={s.text} q={q} /></span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="py-6 text-body text-ink-2">No line mentions “{filter.trim()}”. Try one word.</p>
        )
      ) : (
        <p dir="auto" tabIndex={0} className="max-h-[36rem] max-w-prose overflow-y-auto whitespace-pre-line font-serif text-read">{text}</p>
      )}
    </Block>
  );
}
