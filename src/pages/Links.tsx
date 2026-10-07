import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Link2 } from "lucide-react";
import { formatTimestamp } from "../../shared/youtube-url";
import { listLinks } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { EmptyState, ErrorBox, PageHeader, Spinner } from "../components/ui";
import { SiteIcon, safeHref } from "../components/SiteIcon";

export function Links() {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("");
  const links = useAsync(() => listLinks({ q: query, domain }), [query, domain]);

  const domains = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of links.data ?? []) if (l.domain) counts.set(l.domain, (counts.get(l.domain) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [links.data]);

  return (
    <div>
      <PageHeader title="Links" subtitle="Every link saved from every video — find the one you remember seeing." />
      <form className="mb-4 flex gap-2" onSubmit={(e) => (e.preventDefault(), setQuery(q.trim()))}>
        <input dir="auto" className="input max-w-md" placeholder="Search by name, URL or context…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search links" />
        <button className="btn-outline">Search</button>
      </form>
      {domains.length > 0 && !domain && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {domains.map(([d, n]) => (
            <button key={d} className="chip hover:bg-slate-200 dark:hover:bg-slate-700" onClick={() => setDomain(d)}>
              {d} <span className="text-slate-400">{n}</span>
            </button>
          ))}
        </div>
      )}
      {domain && (
        <button className="chip mb-5" onClick={() => setDomain("")}>Domain: {domain} ✕</button>
      )}

      {links.loading ? (
        <Spinner />
      ) : links.error ? (
        <ErrorBox message={links.error} />
      ) : !links.data!.length ? (
        <EmptyState icon={<Link2 className="h-10 w-10" />} title="No links yet">
          Links from video descriptions and captions show up here automatically.
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
          {links.data!.map((l) => (
            <li key={l.id} className="flex items-start gap-3 p-3.5">
              <SiteIcon domain={l.domain} className="mt-0.5 h-5 w-5" />
              <div className="min-w-0 flex-1">
                <a href={safeHref(l.url)} target="_blank" rel="noreferrer" className="font-medium hover:underline" dir="auto">{l.label || l.domain || l.url}</a>
                <p className="truncate text-xs text-brand-600">{l.url}</p>
                {l.context && <p dir="auto" className="mt-0.5 line-clamp-1 text-xs text-slate-500">{l.context}</p>}
                <Link to={`/item/${l.item_id}`} className="mt-1 inline-block text-xs text-slate-500 hover:text-brand-600 hover:underline" dir="auto">
                  from: {l.items.title}{l.timestamp_sec !== null ? ` @ ${formatTimestamp(l.timestamp_sec)}` : ""}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
