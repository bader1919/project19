import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, X } from "lucide-react";
import { listLinks } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { useDebounced } from "../lib/useDebounced";
import { EmptyState, ErrorBox, PageHeader } from "../components/ui";
import { SkeletonRows } from "../components/Skeleton";
import { Menu } from "../components/Menu";
import { LinkRow } from "../components/LinkRow";
import { SearchField } from "../components/SearchField";

type Sort = "newest" | "oldest" | "name";
const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Name, A to Z" },
];

export function Links() {
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim());
  const [domain, setDomain] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const links = useAsync(() => listLinks({ q: query, domain }), [query, domain]);

  // Keep the site list from the unfiltered result so choosing a site doesn't collapse the menu to one entry.
  const [sites, setSites] = useState<[string, number][]>([]);
  const lastKey = useRef("");
  useEffect(() => {
    if (!links.data || domain) return;
    const counts = new Map<string, number>();
    for (const l of links.data) if (l.domain) counts.set(l.domain, (counts.get(l.domain) ?? 0) + 1);
    const next = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30);
    const key = JSON.stringify(next);
    if (key !== lastKey.current) { lastKey.current = key; setSites(next); }
  }, [links.data, domain]);

  const rows = useMemo(() => {
    const data = [...(links.data ?? [])];
    if (sort === "oldest") data.reverse();
    else if (sort === "name") data.sort((a, b) => (a.label || a.domain || a.url).localeCompare(b.label || b.domain || b.url));
    return data;
  }, [links.data, sort]);

  const filtered = Boolean(query || domain);
  const clear = () => { setQ(""); setDomain(""); };

  return (
    <div className="max-w-list">
      <PageHeader title="Links" meta={links.data ? `${rows.length} ${rows.length === 1 ? "link" : "links"}` : undefined} />

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SearchField label="Search links" placeholder="Search by name, site or context" value={q} onChange={setQ} className="w-full sm:w-80" />
        <Menu
          label="Site filter"
          triggerClassName="btn-outline btn-sm"
          trigger={<>Site<ChevronDown className="h-4 w-4 text-ink-2" aria-hidden="true" /></>}
          items={[
            { label: "All sites", checked: !domain, onSelect: () => setDomain("") },
            ...sites.map(([d, n]) => ({ label: `${d} (${n})`, checked: d === domain, onSelect: () => setDomain(d) })),
          ]}
        />
        <Menu
          label="Sort links"
          triggerClassName="btn-outline btn-sm"
          trigger={<>Sort: {SORTS.find((s) => s.value === sort)!.label}<ChevronDown className="h-4 w-4 text-ink-2" aria-hidden="true" /></>}
          items={SORTS.map((s) => ({ label: s.label, checked: s.value === sort, onSelect: () => setSort(s.value) }))}
        />
        {domain && (
          <button type="button" className="chip min-h-[32px] gap-1.5 ps-2.5 pe-1.5 hover:bg-line" onClick={() => setDomain("")} aria-label={`Remove site filter ${domain}`}>
            <bdi>Site: {domain}</bdi><X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {links.error && !links.data ? (
        <ErrorBox message="Couldn't load your links. Check your connection and try again." onRetry={links.reload} />
      ) : links.loading && !links.data ? (
        <SkeletonRows thumb={false} />
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState
            title={query ? `No links match “${query}”` : `No links from ${domain}`}
            action={<button type="button" className="btn-outline" onClick={clear}>Clear filters</button>}
          >
            Search covers link names, addresses, sites and the words around each link.
          </EmptyState>
        ) : (
          <EmptyState title="No links yet" action={<Link to="/add" className="btn-primary">Save a video</Link>}>
            Links in video descriptions, and the ones said out loud, are collected here after you save a video.
          </EmptyState>
        )
      ) : (
        <ul>
          {rows.map((l) => <LinkRow key={l.id} link={l} />)}
        </ul>
      )}
    </div>
  );
}
