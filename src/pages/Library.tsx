import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SearchX, X } from "lucide-react";
import { listCollections, listTopics, searchItems, type SearchRow } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { moduleFor } from "../modules/registry";
import { ItemCard } from "../components/ItemCard";
import { EmptyState, ErrorBox, PageHeader, Spinner } from "../components/ui";

const PAGE = 30;
const STATUSES = [
  { value: "", label: "Any status" },
  { value: "analyzed", label: "Analyzed" },
  { value: "fetched", label: "Needs analysis" },
  { value: "transcript_pending", label: "No transcript" },
];

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

  return (
    <div>
      <PageHeader
        title={q ? `Results for “${q}”` : collectionName ? `Collection: ${collectionName}` : title}
        subtitle={results.data ? `${items.length}${hasMore ? "+" : ""} item${items.length === 1 ? "" : "s"}` : undefined}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={tag} onChange={(e) => set("tag", e.target.value)} aria-label="Topic">
          <option value="">All topics</option>
          {topics.data?.map((t) => <option key={t.id} value={t.name}>{t.name} ({t.item_count})</option>)}
        </select>
        <select className="input w-auto" value={collection} onChange={(e) => set("collection", e.target.value)} aria-label="Collection">
          <option value="">All collections</option>
          {collections.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input w-auto" value={status} onChange={(e) => set("status", e.target.value)} aria-label="Status">
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {(q || tag || collection || status) && (
          <button className="btn-ghost text-xs" onClick={() => setParams(new URLSearchParams())}>
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
      </div>

      {results.loading ? (
        <Spinner />
      ) : results.error ? (
        <ErrorBox message={results.error} />
      ) : items.length === 0 ? (
        <EmptyState icon={<SearchX className="h-10 w-10" />} title="Nothing found">
          {q ? "Try fewer or different words — search covers titles, summaries, transcripts, links and notes." : "No items match these filters."}
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((i) => <ItemCard key={i.id} item={i} showSnippet={Boolean(q)} />)}
          </div>
          {hasMore && (
            <div className="mt-6 text-center">
              <button
                className="btn-outline"
                onClick={async () => {
                  const next = await searchItems({ q, type, tag, collection, status, limit: PAGE, offset: items.length });
                  setExtra((e) => [...e, ...next]);
                  if (next.length < PAGE) setMore(false);
                }}
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
