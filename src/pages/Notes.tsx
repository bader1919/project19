import { useState } from "react";
import { Link } from "react-router-dom";
import { NotebookPen } from "lucide-react";
import { listNotes } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { EmptyState, ErrorBox, PageHeader, Spinner, timeAgo } from "../components/ui";

export function Notes() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const notes = useAsync(() => listNotes(query), [query]);

  return (
    <div>
      <PageHeader title="Notes" subtitle="Everything you've written, newest first." />
      <form className="mb-5 flex gap-2" onSubmit={(e) => (e.preventDefault(), setQuery(q.trim()))}>
        <input dir="auto" className="input max-w-md" placeholder="Search your notes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" />
        <button className="btn-outline">Search</button>
      </form>
      {notes.loading ? (
        <Spinner />
      ) : notes.error ? (
        <ErrorBox message={notes.error} />
      ) : !notes.data!.filter((n) => n.body.trim()).length ? (
        <EmptyState icon={<NotebookPen className="h-10 w-10" />} title="No notes yet">Open any item and write in “My notes”.</EmptyState>
      ) : (
        <div className="space-y-3">
          {notes.data!.filter((n) => n.body.trim()).map((n) => (
            <Link key={n.id} to={`/item/${n.item_id}`} className="card block p-4 transition hover:shadow-md">
              <p dir="auto" className="line-clamp-4 whitespace-pre-line text-sm">{n.body}</p>
              <p className="mt-2 text-xs text-slate-500" dir="auto">{n.items.title} · {timeAgo(n.updated_at)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
