import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { deleteTopic, listTopics, renameTopic } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { EmptyState, ErrorBox, PageHeader } from "../components/ui";
import { SkeletonRows } from "../components/Skeleton";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { IconButton } from "../components/IconButton";
import { Menu } from "../components/Menu";

type Topic = { id: string; name: string; item_count: number };
type Sort = "used" | "az";

const count = (n: number) => `${n} ${Number(n) === 1 ? "video" : "videos"}`;

/** Name that turns into an input in the same box (no layout shift). Enter saves, Esc cancels. */
function NameCell({ topic, editing, onDone }: { topic: Topic; editing: boolean; onDone: (name: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const [value, setValue] = useState(topic.name);
  useEffect(() => {
    if (editing) {
      finished.current = false;
      setValue(topic.name);
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing, topic.name]);
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onDone(save && value.trim() && value.trim() !== topic.name ? value.trim() : null);
  };
  return (
    <div className="grid h-7 grid-cols-[minmax(0,1fr)]">
      <Link
        to={`/library?tag=${encodeURIComponent(topic.name)}`}
        dir="auto"
        tabIndex={editing ? -1 : 0}
        aria-hidden={editing}
        className={`col-start-1 row-start-1 truncate font-serif text-[1.125rem] font-semibold leading-7 group-hover:text-binding ${editing ? "invisible" : ""}`}
      >
        {topic.name}
      </Link>
      {editing && (
        <input
          ref={ref}
          dir="auto"
          aria-label={`New name for topic ${topic.name}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => finish(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); finish(true); }
            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
          }}
          className="col-start-1 row-start-1 h-7 w-full rounded-tab border border-binding bg-sheet px-1 font-serif text-[1.125rem] font-semibold leading-7"
        />
      )}
    </div>
  );
}

export function Topics() {
  const topics = useAsync(listTopics, []);
  const [sort, setSort] = useState<Sort>("used");
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Topic | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const d = [...((topics.data ?? []) as Topic[])];
    return sort === "az"
      ? d.sort((a, b) => a.name.localeCompare(b.name))
      : d.sort((a, b) => Number(b.item_count) - Number(a.item_count) || a.name.localeCompare(b.name));
  }, [topics.data, sort]);

  async function rename(t: Topic, name: string | null) {
    setEditing(null);
    if (!name) return;
    try {
      setError(null);
      await renameTopic(t.id, name);
      topics.reload();
    } catch (e) {
      setError(`Couldn't rename “${t.name}”. ${(e as Error).message}`);
    }
  }

  return (
    <div className="max-w-list">
      <PageHeader
        title="Topics"
        meta={topics.data ? `${rows.length} ${rows.length === 1 ? "topic" : "topics"}. Claude reuses these names when it analyzes new videos.` : undefined}
        actions={
          rows.length > 1 ? (
            <div role="group" aria-label="Sort topics" className="flex gap-1">
              {([["used", "Most used"], ["az", "A to Z"]] as const).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={sort === v} className={`btn-sm rounded-ctl px-3 font-medium ${sort === v ? "bg-binding-wash text-binding" : "text-ink-2 hover:bg-binding-wash/60"}`} onClick={() => setSort(v)}>
                  {l}
                </button>
              ))}
            </div>
          ) : undefined
        }
      />
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      {topics.error && !topics.data ? (
        <ErrorBox message="Couldn't load your topics. Check your connection and try again." onRetry={topics.reload} />
      ) : topics.loading && !topics.data ? (
        <SkeletonRows thumb={false} n={6} />
      ) : rows.length === 0 ? (
        <EmptyState title="No topics yet" action={<Link to="/library" className="btn-primary">Open your library</Link>}>
          Claude adds topics when it analyzes a video. You can also add one to any video from its page.
        </EmptyState>
      ) : (
        <ul className="grid sm:grid-cols-2 sm:gap-x-10">
          {rows.map((t) => (
            <li key={t.id} dir={/[\u0590-\u08FF]/.test(t.name) ? "rtl" : "ltr"} className="row group flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <NameCell topic={t} editing={editing === t.id} onDone={(n) => rename(t, n)} />
                <p className="text-meta text-ink-2">{count(Number(t.item_count))}</p>
              </div>
              <div className="hidden gap-0.5 sm:flex [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
                <IconButton label={`Rename topic ${t.name}`} onClick={() => setEditing(t.id)}><Pencil className="h-4 w-4" aria-hidden="true" /></IconButton>
                <IconButton label={`Delete topic ${t.name}`} onClick={() => setDeleting(t)}><Trash2 className="h-4 w-4" aria-hidden="true" /></IconButton>
              </div>
              <Menu
                className="sm:hidden"
                align="end"
                label={`More actions for ${t.name}`}
                trigger={<MoreHorizontal className="h-5 w-5" aria-hidden="true" />}
                items={[
                  { label: "Rename topic", icon: <Pencil className="h-4 w-4" aria-hidden="true" />, onSelect: () => setEditing(t.id) },
                  { label: "Delete topic", icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, danger: true, onSelect: () => setDeleting(t) },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete topic “${deleting.name}”?`}
          body={`${count(Number(deleting.item_count))} will keep everything else. Only the topic is removed.`}
          confirmLabel="Delete topic"
          danger
          onConfirm={async () => { await deleteTopic(deleting.id); topics.reload(); }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
