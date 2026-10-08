import { useState } from "react";
import { Link } from "react-router-dom";
import { listNotes } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { useDebounced } from "../lib/useDebounced";
import { EmptyState, ErrorBox, PageHeader, timeAgo } from "../components/ui";
import { SkeletonRows } from "../components/Skeleton";
import { SearchField } from "../components/SearchField";

export function Notes() {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());
  const notes = useAsync(() => listNotes(query), [query]);
  const rows = (notes.data ?? []).filter((n) => n.body.trim());

  return (
    <div className="max-w-list">
      <PageHeader title="Notes" meta={notes.data ? `${rows.length} ${rows.length === 1 ? "note" : "notes"}, newest first` : undefined} />
      <SearchField label="Search your notes" placeholder="Search your notes" value={q} onChange={setQ} className="mb-4 w-full sm:w-80" />

      {notes.error && !notes.data ? (
        <ErrorBox message="Couldn't load your notes. Check your connection and try again." onRetry={notes.reload} />
      ) : notes.loading && !notes.data ? (
        <SkeletonRows thumb={false} />
      ) : rows.length === 0 ? (
        query ? (
          <EmptyState title={`No notes match “${query}”`} action={<button type="button" className="btn-outline" onClick={() => setQ("")}>Clear search</button>}>
            Search covers the text of your notes. Try one word.
          </EmptyState>
        ) : (
          <EmptyState title="No notes yet" action={<Link to="/library" className="btn-primary">Open your library</Link>}>
            Notes you write on a video page show up here. Open a video and add one.
          </EmptyState>
        )
      ) : (
        <ul>
          {rows.map((n) => (
            <li key={n.id} className="row">
              <Link to={`/item/${n.item_id}`} className="group block">
                <p dir="auto" className="line-clamp-3 whitespace-pre-line font-serif text-read">{n.body}</p>
                <p className="mt-1.5 text-meta text-ink-2">
                  <span dir="auto" className="group-hover:text-binding group-hover:underline">{n.items.title}</span>
                  {", "}
                  {timeAgo(n.updated_at)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
