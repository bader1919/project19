import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { addNote, deleteNote, saveNote, type ItemFull, type NoteRow } from "../../lib/data";
import { ConfirmDialog } from "../ConfirmDialog";

function NoteEditor({ note, onDeleted }: { note: NoteRow; onDeleted: () => void }) {
  const [body, setBody] = useState(note.body);
  const [state, setState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(body);
  const savedBody = useRef(note.body);
  latest.current = body;

  const flush = async () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const text = latest.current;
    if (text === savedBody.current) {
      setState("saved");
      return;
    }
    setState("saving");
    try {
      await saveNote(note.id, text);
      savedBody.current = text;
      // Typing may have continued while saving; only show "Saved" if nothing is pending.
      setState(latest.current === text ? "saved" : "dirty");
    } catch {
      setState("error");
    }
  };

  // Flush on unmount and when the tab is closed or hidden.
  useEffect(() => {
    const onHide = () => {
      if (latest.current !== savedBody.current) void flush();
    };
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onHide);
      onHide();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const preview = latest.current.trim().slice(0, 60);

  return (
    <div className="sheet">
      <textarea
        dir="auto"
        className="block min-h-28 w-full resize-y rounded-t-frame bg-transparent p-3 font-serif text-read placeholder:text-ink-2/70 focus-visible:outline-offset-[-2px]"
        placeholder="Why it matters, what to try, where you'll use it"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setState("dirty");
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, 800);
        }}
        onBlur={() => void flush()}
        aria-label="Note"
      />
      <div className="flex min-h-[44px] items-center justify-between border-t border-line px-3 text-small text-ink-2 sm:min-h-[36px]">
        {state === "error" ? (
          <button type="button" className="font-medium text-danger hover:underline" onClick={() => void flush()}>Not saved. Retry</button>
        ) : (
          <span role="status">{state === "saved" ? "Saved" : state === "saving" ? "Saving…" : "Editing…"}</span>
        )}
        <button type="button" className="btn-danger btn-sm" onClick={() => setConfirming(true)}>Delete note</button>
      </div>
      {confirming && (
        <ConfirmDialog
          title="Delete this note?"
          body={preview ? `“${preview}${latest.current.trim().length > 60 ? "…" : ""}” is deleted for good.` : "This empty note is deleted."}
          confirmLabel="Delete note"
          danger
          onConfirm={async () => {
            clearTimeout(timer.current);
            timer.current = undefined;
            savedBody.current = latest.current; // nothing left to flush
            await deleteNote(note.id);
            onDeleted();
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

/** Notes for this video. Autosaves; always one tap away (right rail on desktop, below the sections on mobile). */
export function NotesBox({ item, onChanged }: { item: ItemFull; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const add = async () => {
    try {
      setError(null);
      await addNote(item.id);
      onChanged();
    } catch {
      setError("Couldn't add a note. Check your connection and try again.");
    }
  };
  return (
    <section id="notes" aria-labelledby="notes-h" data-block className="scroll-mt-32">
      <div className="mb-3 flex min-h-[44px] items-center justify-between gap-2 sm:min-h-[32px]">
        <h2 id="notes-h" tabIndex={-1} className="font-serif text-lead font-semibold outline-none">My notes</h2>
        {item.notes.length > 0 && (
          <button type="button" className="btn-ghost btn-sm" onClick={add}><Plus className="h-4 w-4" aria-hidden="true" /> New note</button>
        )}
      </div>
      <div className="space-y-3">
        {item.notes.map((n) => <NoteEditor key={n.id} note={n} onDeleted={onChanged} />)}
        {!item.notes.length && (
          <button type="button" className="btn-outline w-full justify-start text-ink-2" onClick={add}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add a note
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-meta text-danger">{error}</p>}
    </section>
  );
}
