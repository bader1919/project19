import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { api } from "../../lib/api";
import { Block } from "./shared";

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!/^https?:\/\//.test(p)) return <span key={i}>{p}</span>;
        // Punctuation right after a URL ("…/page.", "ollama.com،") belongs to the sentence.
        const url = p.replace(/[.,;:!?'"»)\]}>،؛؟…]+$/, "");
        return (
          <span key={i}>
            <a href={url} target="_blank" rel="noreferrer" className="break-all text-binding hover:underline">{url}</a>
            {p.slice(url.length)}
          </span>
        );
      })}
    </>
  );
}

/** Paste box shown while the video has no description (YouTube blocks the server from reading it). */
function PasteDescription({ itemId, onChanged }: { itemId: string; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api("/ingest", { body: { item_id: itemId, description: text } });
      setText("");
      onChanged();
    } catch (e) {
      setMessage(`Couldn't save the description: ${(e as Error).message}. Try again.`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Block id="description" title="Description">
      <div className="sheet max-w-xl space-y-3 p-4">
        <label htmlFor="paste-description" className="block text-meta font-semibold text-ink-2">Paste the video's description</label>
        <p className="text-meta text-ink-2">On YouTube, open "… more" under the video, copy the text and paste it here. Its links are saved and the summary is redone.</p>
        <textarea id="paste-description" dir="auto" className="input h-28" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="button" className="btn-primary" disabled={!text.trim() || busy} aria-busy={busy} onClick={save}>
          {busy ? "Saving…" : "Save description"}
        </button>
        {message && <p role="alert" className="border-s-4 border-danger bg-danger/10 px-3 py-2 text-meta">{message}</p>}
      </div>
    </Block>
  );
}

/** The video's own description text, collapsed to a few lines until asked for; a paste box when it is missing. */
export function DescriptionBlock({ itemId, description, onChanged }: { itemId: string; description: string | null | undefined; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  if (!description?.trim()) return <PasteDescription itemId={itemId} onChanged={onChanged} />;
  return (
    <Block id="description" title="Description">
      <p dir="auto" id="description-text" className={`max-w-prose whitespace-pre-line break-words text-body ${open ? "" : "line-clamp-4"}`}>
        <Linkified text={description} />
      </p>
      <button type="button" className="btn-ghost btn-sm -ms-3 mt-2" aria-expanded={open} aria-controls="description-text" onClick={() => setOpen((o) => !o)}>
        <ChevronDown className={`h-4 w-4 transition-transform duration-100 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        {open ? "Hide full description" : "Show full description"}
      </button>
    </Block>
  );
}
