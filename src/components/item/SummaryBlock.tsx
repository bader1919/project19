import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { updateItem, type ItemFull } from "../../lib/data";
import { Skeleton } from "../Skeleton";
import { Block, CopyButton, asArray } from "./shared";

/** Summary and key points, edited in place. The editor keeps the height of the rendered text so nothing below moves. */
export function SummaryBlock({ item, working, onSaved }: { item: ItemFull; working: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(item.summary ?? "");
  const [points, setPoints] = useState(asArray(item.key_points).join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minH, setMinH] = useState(0);
  const shown = useRef<HTMLDivElement>(null);
  const pointsKey = asArray(item.key_points).join("\n");

  useEffect(() => {
    if (editing) return; // never clobber an edit in progress when the item reloads
    setSummary(item.summary ?? "");
    setPoints(pointsKey);
  }, [item.summary, pointsKey, editing]);

  const startEdit = () => {
    setMinH(shown.current?.offsetHeight ?? 0);
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateItem(item.id, { summary, key_points: points.split("\n").map((p) => p.trim()).filter(Boolean) });
      setEditing(false);
      onSaved();
    } catch {
      setError("Couldn't save your changes. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const keyPoints = asArray(item.key_points).filter((p) => typeof p === "string");

  return (
    <Block
      id="summary"
      title="Summary"
      first
      action={!editing && (item.summary || !working) ? (
        <button type="button" className="btn-ghost btn-sm" onClick={startEdit}>
          <Pencil className="h-4 w-4" aria-hidden="true" /> Edit summary
        </button>
      ) : undefined}
    >
      {editing ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="sum-text" className="mb-1 block text-meta font-semibold text-ink-2">Summary</label>
            <textarea id="sum-text" dir="auto" className="input font-serif text-read" style={{ minHeight: Math.max(minH * 0.6, 140) }} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div>
            <label htmlFor="sum-points" className="mb-1 block text-meta font-semibold text-ink-2">Key points, one per line</label>
            <textarea id="sum-points" dir="auto" className="input font-serif text-read" style={{ minHeight: Math.max(minH * 0.5, 120) }} value={points} onChange={(e) => setPoints(e.target.value)} />
          </div>
          {error && <p role="alert" className="border-s-4 border-danger bg-danger/10 px-3 py-2 text-meta">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setEditing(false); setError(null); }} disabled={busy}>Cancel</button>
            <button type="button" className="btn-primary" onClick={save} disabled={busy} aria-busy={busy}>{busy ? "Saving…" : "Save summary"}</button>
          </div>
        </div>
      ) : item.summary ? (
        <div ref={shown}>
          <p dir="auto" className="text-lead max-w-prose whitespace-pre-line font-serif">{item.summary}</p>
          {keyPoints.length > 0 && (
            <>
              <h3 className="mt-6 text-meta font-semibold text-ink-2">Key points</h3>
              <ul dir="auto" className="mt-2 max-w-prose list-disc space-y-2 ps-5 font-serif text-read marker:text-binding">
                {keyPoints.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </>
          )}
        </div>
      ) : working ? (
        <div role="status" aria-label="Summary is being written" className="max-w-prose space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      ) : (
        <div className="max-w-prose rounded-ctl bg-binding-wash p-4 text-body">
          <p>Not summarized yet. In Claude, say: <em>“Analyze this RefVault video: {item.title}”</em>, or write your own with Edit summary.</p>
          <div className="mt-2 flex items-center gap-1 text-meta text-ink-2">
            <CopyButton text={`Analyze this RefVault item ${item.id} (${item.title}) and save the analysis.`} label="Copy prompt for Claude" />
            Copy prompt for Claude
          </div>
        </div>
      )}
    </Block>
  );
}
