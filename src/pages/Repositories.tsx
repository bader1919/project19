import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { listLinks } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { groupRepos, type RepoGroup } from "../../shared/resources";
import { cachedRepo, fetchRepoMeta, pool, RateLimited, type RepoMeta } from "../lib/enrich";
import { EmptyState, ErrorBox, PageHeader } from "../components/ui";
import { SkeletonRows } from "../components/Skeleton";
import { SearchField } from "../components/SearchField";
import { Locator } from "../components/Locator";

const MAX_DETAILS = 60; // GitHub allows 60 unauthenticated requests an hour per network.

function RepoRow({ repo, meta }: { repo: RepoGroup; meta: RepoMeta | null | undefined }) {
  return (
    <li className="row group relative">
      <a
        href={repo.url}
        target="_blank"
        rel="noreferrer"
        className="block break-words text-[1.0625rem] font-medium leading-6 after:absolute after:inset-0 hover:text-binding hover:underline"
      >
        <bdi dir="ltr">{repo.name}</bdi>
      </a>
      {meta && (
        <p className="mt-0.5 text-meta text-ink-2">
          <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5" aria-hidden="true" /><span className="num">{meta.stars.toLocaleString()}</span><span className="sr-only"> stars</span></span>
          {meta.language && <span className="ms-3">{meta.language}</span>}
          {meta.archived && <span className="ms-3">Archived</span>}
          {meta.description && <span className="ms-3">{meta.description}</span>}
        </p>
      )}
      <ul className="relative z-10 mt-1 space-y-0.5">
        {repo.mentions.map((m) => (
          <li key={m.item_id} className="flex items-center gap-2">
            <Link
              to={`/item/${m.item_id}${m.timestamp_sec !== null ? `?t=${Math.floor(m.timestamp_sec)}` : ""}`}
              className="min-w-0 truncate text-meta text-ink-2 hover:text-binding hover:underline max-sm:-my-2 max-sm:py-3"
            >
              From <bdi>{m.title}</bdi>
            </Link>
            <Locator sec={m.timestamp_sec} to={`/item/${m.item_id}?t=${Math.floor(m.timestamp_sec ?? 0)}`} label={repo.name} />
          </li>
        ))}
      </ul>
    </li>
  );
}

export function Repositories() {
  const [q, setQ] = useState("");
  const links = useAsync(() => listLinks({ domain: "github.com", limit: 2000 }), []);
  const repos = useMemo(() => groupRepos(links.data ?? []), [links.data]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? repos.filter((r) => r.name.toLowerCase().includes(s) || r.mentions.some((m) => m.title.toLowerCase().includes(s))) : repos;
  }, [repos, q]);

  const [meta, setMeta] = useState<Record<string, RepoMeta | null>>({});
  const [state, setState] = useState<"idle" | "loading" | "limited" | "failed">("idle");
  const stop = useRef({ aborted: false });
  useEffect(() => () => { stop.current.aborted = true; }, []);

  // Show anything already cached from an earlier visit without spending requests.
  useEffect(() => {
    const known: Record<string, RepoMeta | null> = {};
    for (const r of repos) { const c = cachedRepo(r.name); if (c !== undefined) known[r.name] = c; }
    setMeta((m) => ({ ...known, ...m }));
  }, [repos]);

  const missing = repos.filter((r) => meta[r.name] === undefined).slice(0, MAX_DETAILS);
  const loadDetails = async () => {
    setState("loading");
    let limited = false, failed = false;
    await pool(missing, 4, async (r) => {
      try {
        const m = await fetchRepoMeta(r.name);
        setMeta((prev) => ({ ...prev, [r.name]: m }));
      } catch (e) {
        if (e instanceof RateLimited) { limited = true; stop.current.aborted = true; } else failed = true;
      }
    }, stop.current);
    stop.current = { aborted: false };
    setState(limited ? "limited" : failed ? "failed" : "idle");
  };

  return (
    <div className="max-w-list">
      <PageHeader
        title="Repositories"
        meta={links.data ? `${repos.length} ${repos.length === 1 ? "repository" : "repositories"} linked from your videos` : undefined}
        actions={repos.length > 0 && missing.length > 0 ? (
          <button type="button" className="btn-outline btn-sm" disabled={state === "loading"} onClick={loadDetails}>
            {state === "loading" ? "Loading…" : "Load stars and languages"}
          </button>
        ) : undefined}
      />
      {state === "limited" && <p role="status" className="mb-3 text-meta text-ink-2">GitHub has paused requests from this network for about an hour. What loaded is saved; try again later for the rest.</p>}
      {state === "failed" && <p role="status" className="mb-3 text-meta text-ink-2">Some details couldn't be loaded. Try again in a moment.</p>}

      {links.error && !links.data ? (
        <ErrorBox message="Couldn't load your repositories. Check your connection and try again." onRetry={links.reload} />
      ) : links.loading && !links.data ? (
        <SkeletonRows thumb={false} />
      ) : repos.length === 0 ? (
        <EmptyState title="No repositories yet" action={<Link to="/add" className="btn-primary">Save a video</Link>}>
          GitHub projects linked in a video's description or mentioned in its captions are collected here.
        </EmptyState>
      ) : (
        <>
          <SearchField label="Search repositories" placeholder="Search by name or video" value={q} onChange={setQ} className="mb-2 w-full sm:w-80" />
          {shown.length === 0 ? (
            <EmptyState title={`No repositories match “${q.trim()}”`} action={<button type="button" className="btn-outline" onClick={() => setQ("")}>Clear search</button>} />
          ) : (
            <ul>{shown.map((r) => <RepoRow key={r.name.toLowerCase()} repo={r} meta={meta[r.name]} />)}</ul>
          )}
        </>
      )}
    </div>
  );
}
