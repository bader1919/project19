import { Link } from "react-router-dom";
import { Pencil, Tags, Trash2 } from "lucide-react";
import { deleteTopic, listTopics, renameTopic } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { EmptyState, ErrorBox, PageHeader, Spinner } from "../components/ui";

export function Topics() {
  const topics = useAsync(listTopics, []);
  const max = Math.max(1, ...(topics.data ?? []).map((t) => Number(t.item_count)));

  return (
    <div>
      <PageHeader title="Topics" subtitle="Browse your library by subject. Claude reuses these names when it analyzes new videos." />
      {topics.loading ? (
        <Spinner />
      ) : topics.error ? (
        <ErrorBox message={topics.error} />
      ) : !topics.data!.length ? (
        <EmptyState icon={<Tags className="h-10 w-10" />} title="No topics yet">Topics are added when Claude analyzes a video, or by you on any item.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topics.data!.map((t) => (
            <div key={t.id} className="card group flex items-center gap-3 p-3.5">
              <Link to={`/library?tag=${encodeURIComponent(t.name)}`} className="min-w-0 flex-1">
                <p dir="auto" className="truncate font-medium group-hover:text-brand-600">{t.name}</p>
                <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(Number(t.item_count) / max) * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{t.item_count} item{Number(t.item_count) === 1 ? "" : "s"}</p>
              </Link>
              <div className="flex opacity-60 group-hover:opacity-100">
                <button
                  className="btn-ghost p-1.5"
                  aria-label={`Rename ${t.name}`}
                  onClick={async () => {
                    const name = prompt("Rename topic", t.name);
                    if (name?.trim() && name !== t.name) {
                      try {
                        await renameTopic(t.id, name);
                        topics.reload();
                      } catch (e) {
                        alert((e as Error).message);
                      }
                    }
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  className="btn-ghost p-1.5 hover:text-red-600"
                  aria-label={`Delete ${t.name}`}
                  onClick={async () => {
                    if (confirm(`Delete topic “${t.name}”? Items keep everything else.`)) {
                      await deleteTopic(t.id);
                      topics.reload();
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
