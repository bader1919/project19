import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, X } from "lucide-react";
import { listCollections, listTopics, searchItems, type SearchRow } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { moduleFor } from "../modules/registry";
import { ItemRow } from "../components/ItemRow";
import { Menu } from "../components/Menu";
import { SkeletonRows } from "../components/Skeleton";
import { EmptyState, ErrorBox, PageHeader } from "../components/ui";

const PAGE = 30;
const PROGRESS = [
  { value: "", label: "All" },
  { value: "analyzed", label: "Done" },
  { value: "fetched", label: "Summarizing" },
  { value: "transcript_pending", label: "Getting transcript" },
];

function FilterMenu({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <Menu
      label={`${label} filter`}
      triggerClassName="btn-outline btn-sm"
      trigger={<>{label}<ChevronDown className="h-4 w-4 text-ink-2" aria-hidden="true" /></>}
      items={options.map((o) => ({ label: o.label, checked: o.value === value, onSelect: () => onChange(o.value) }))}
    />
  );
}

/** Library browser; also serves module pages like /videos via `type`. */
export function Library({ type }: { type?: string }) {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const tag = params.get("tag") ?? "";
  const collection = params.get("collection") ?? "";
  const status = params.get("status") ?? "";

  const topics = useAsync(listTopics, []);
  const collections = useAsync(listCollections, []);
  const [extra, setExtra] = useState<SearchRow[]>([]);
  const [more, setMore] = useState(true);
  const results = useAsync(
    () => searchItems({ q, type, tag, collection, status, limit: PAGE }),
    [q, type, tag, collection, status],
  );
  useEffect(() => {
    setExtra([]);
    setMore(true);
  }, [q, type, tag, collection, status]);

  const items = [...(results.data ?? []), ...extra];
  const hasMore = more && (results.data?.length ?? 0) === PAGE;

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };
  const title = type ? (moduleFor(type)?.label ?? "Library") : "Library";
  const collectionName = collections.data?.find((c) => c.id === collection)?.name;

  const noun = type ? (moduleFor(type)?.label ?? "items").toLowerCase() : "videos";
  const count = `${items.length}${hasMore ? "+" : ""}`;
  const progressLabel = PROGRESS.find((o) => o.value === status)?.label;
  const active = [
    tag && { key: "tag", text: `Topic: ${tag}` },
    collection && { key: "collection", text: `Collection: ${collectionName ?? "…"}` },
    status && { key: "status", text: `Progress: ${progressLabel ?? status}` },
  ].filter(Boolean) as { key: string; text: string }[];

  return (
    <div className="max-w-list">
      <PageHeader
        title={q ? `Results for “${q}”` : collectionName ? `Collection: ${collectionName}` : title}
        meta={results.data ? (q ? `${count} ${items.length === 1 ? "result" : "results"}` : `${count} ${items.length === 1 && !hasMore ? noun.replace(/s$/, "") : noun}`) : undefined}
      />

      <div className="mb-2 flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <FilterMenu label="Topic" value={tag} onChange={(v) => set("tag", v)}
          options={[{ value: "", label: "All topics" }, ...(topics.data ?? []).map((t) => ({ value: t.name, label: `${t.name} (${t.item_count})` }))]} />
        <FilterMenu label="Collection" value={collection} onChange={(v) => set("collection", v)}
          options={[{ value: "", label: "All collections" }, ...(collections.data ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
        <FilterMenu label="Progress" value={status} onChange={(v) => set("status", v)} options={PROGRESS} />
        {active.map((a) => (
          <button key={a.key} type="button" className="chip min-h-[32px] gap-1.5 ps-2.5 pe-1.5 hover:bg-line" onClick={() => set(a.key, "")} aria-label={`Remove filter ${a.text}`}>
            <bdi>{a.text}</bdi><X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ))}
        {(q || active.length > 0) && (
          <button className="btn-ghost btn-sm" onClick={() => setParams(new URLSearchParams())}>Clear filters</button>
        )}
      </div>

      {results.loading ? (
        <SkeletonRows />
      ) : results.error ? (
        <ErrorBox message="Couldn't load your library. Check your connection and try again." onRetry={results.reload} />
      ) : items.length === 0 ? (
        q ? (
          <EmptyState
            title={`No match for “${q}”`}
            action={<button className="btn-outline" onClick={() => setParams(new URLSearchParams())}>Clear filters</button>}
          >
            Search covers titles, summaries, transcripts, links and notes. Try one word.
          </EmptyState>
        ) : active.length > 0 ? (
          <EmptyState title="No videos match these filters" action={<button className="btn-outline" onClick={() => setParams(new URLSearchParams())}>Clear filters</button>}>
            Remove a filter to see more.
          </EmptyState>
        ) : (
          <EmptyState title="Nothing saved yet">Paste a YouTube link on Home, or share a video to RefVault from your phone.</EmptyState>
        )
      ) : (
        <>
          <div>
            {items.map((i) => <ItemRow key={i.id} item={i} showSnippet={Boolean(q)} />)}
          </div>
          {hasMore && (
            <div className="mt-6">
              <button
                className="btn-outline"
                onClick={async () => {
                  const next = await searchItems({ q, type, tag, collection, status, limit: PAGE, offset: items.length });
                  setExtra((e) => [...e, ...next]);
                  if (next.length < PAGE) setMore(false);
                }}
              >
                Show {PAGE} more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
