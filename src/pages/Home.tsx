import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { parseYouTubeId } from "../../shared/youtube-url";
import { api, type IngestResult } from "../lib/api";
import { libraryStats, listLinks, listTopics, searchItems } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { ItemRow } from "../components/ItemRow";
import { Locator } from "../components/Locator";
import { SkeletonRows } from "../components/Skeleton";
import { safeHref } from "../lib/url";
import { EmptyState, ErrorBox, StatusNote } from "../components/ui";

/** One input: a YouTube link saves it, anything else searches the library. The button label follows the input. */
function SmartInput() {
  const navigate = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = value.trim();
  const isLink = useMemo(() => Boolean(trimmed) && Boolean(parseYouTubeId(trimmed)), [trimmed]);

  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) ref.current?.focus();
  }, []);

  async function submit() {
    if (busy) return;
    setError(null);
    if (!isLink) {
      navigate(trimmed ? `/library?q=${encodeURIComponent(trimmed)}` : "/library");
      return;
    }
    setBusy(true);
    try {
      const res = await api<IngestResult>("/ingest", { body: { url: trimmed } });
      navigate(`/item/${res.item_id}`);
    } catch (e) {
      setError(`Couldn't save this link. ${(e as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="smart-input" className="mb-1.5 block text-meta font-semibold text-ink-2">
        Paste a YouTube link or search your library
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="smart-input"
          ref={ref}
          dir="auto"
          className="input min-h-[52px] flex-1 text-[1.0625rem]"
          placeholder="youtube.com/watch?v=… or a word you remember"
          value={value}
          autoComplete="off"
          aria-describedby={error ? "smart-error" : undefined}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
        />
        <button type="submit" className="btn-primary min-h-[52px] sm:min-w-[132px]" disabled={busy}>
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…</> : isLink ? "Save video" : "Search"}
        </button>
      </div>
      {error && <p id="smart-error" role="alert" className="mt-2 text-meta text-danger">{error}</p>}
    </form>
  );
}

function Section({ title, count, more, children }: { title: string; count?: number; more?: { to: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 className="text-h2">
          {title}
          {count !== undefined && <span className="ms-2 font-sans text-meta font-normal text-ink-2">{count}</span>}
        </h2>
        {more && <Link to={more.to} className="text-meta text-binding hover:underline">{more.label}</Link>}
      </div>
      {children}
    </section>
  );
}

export function Home() {
  const stats = useAsync(libraryStats, []);
  const topics = useAsync(listTopics, []);
  const recent = useAsync(() => searchItems({ status: "analyzed", limit: 6 }), []);
  const waiting = useAsync(
    async () => (await Promise.all(["transcript_pending", "fetched", "error"].map((status) => searchItems({ status, limit: 6 })))).flat(),
    [],
  );
  const links = useAsync(() => listLinks({ limit: 5 }), []);

  const top = (topics.data ?? []).filter((t) => t.item_count > 0).slice(0, 5);
  const empty = !recent.loading && !waiting.loading && (recent.data?.length ?? 0) === 0 && (waiting.data?.length ?? 0) === 0;

  return (
    <div className="max-w-list">
      <h1 className="text-display max-sm:text-[1.75rem] max-sm:leading-9">Save a video, or find one you saved</h1>
      <SmartInput />

      <div className="mt-4 space-y-1 text-meta text-ink-2">
        {top.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold">Topics</span>
            {top.map((t) => (
              <Link key={t.id} to={`/library?tag=${encodeURIComponent(t.name)}`} dir="auto" className="inline-flex min-h-[32px] items-center text-binding hover:underline">{t.name}</Link>
            ))}
            <Link to="/topics" className="inline-flex min-h-[32px] items-center text-binding hover:underline">all topics</Link>
          </p>
        )}
        {stats.data && stats.data.items > 0 && (
          <p>
            <Link to="/library" className="hover:text-ink hover:underline">{stats.data.items} {stats.data.items === 1 ? "video" : "videos"}</Link>,{" "}
            <Link to="/links" className="hover:text-ink hover:underline">{stats.data.links} {stats.data.links === 1 ? "link" : "links"}</Link>,{" "}
            <Link to="/notes" className="hover:text-ink hover:underline">{stats.data.notes} {stats.data.notes === 1 ? "note" : "notes"}</Link>
          </p>
        )}
      </div>

      {(waiting.data?.length ?? 0) > 0 && (
        <Section title="Still processing" count={waiting.data!.length}>
          <ul>
            {waiting.data!.map((i) => (
              <li key={i.id}>
                <Link to={`/item/${i.id}`} className="row group flex min-h-[56px] flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <span className="min-w-0">
                    <span dir="auto" className="block truncate font-medium group-hover:text-binding">{i.title}</span>
                    {i.channel && <bdi className="text-meta text-ink-2">{i.channel}</bdi>}
                  </span>
                  <StatusNote status={i.status} long />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {recent.error ? (
        <div className="mt-12"><ErrorBox message="Couldn't load your library. Check your connection and try again." onRetry={recent.reload} /></div>
      ) : empty ? (
        <EmptyState title="Nothing saved yet">
          Paste a YouTube link above, or share a video to RefVault from your phone. Details fill in over the next minute.
        </EmptyState>
      ) : (
        (recent.loading || (recent.data?.length ?? 0) > 0) && (
          <Section title="Recently saved" more={{ to: "/library", label: "See library" }}>
            {recent.loading ? <SkeletonRows n={3} /> : <div>{recent.data!.map((i) => <ItemRow key={i.id} item={i} />)}</div>}
          </Section>
        )
      )}

      {(links.data?.length ?? 0) > 0 && (
        <Section title="Latest links" more={{ to: "/links", label: "See all links" }}>
          <ul>
            {links.data!.map((l) => {
              const href = safeHref(l.url);
              const label = l.label || l.domain || l.url;
              return (
                <li key={l.id} className="row flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" dir="auto" className="block truncate font-medium hover:text-binding hover:underline">{label}</a>
                    ) : (
                      <span dir="auto" className="block truncate font-medium">{label}</span>
                    )}
                    <p className="truncate text-meta text-ink-2">
                      <span className="text-binding">{l.domain}</span>
                      {l.items?.title ? <>, from <span dir="auto">{l.items.title}</span></> : null}
                    </p>
                  </div>
                  <Locator sec={l.timestamp_sec} to={`/item/${l.item_id}?t=${l.timestamp_sec}`} />
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
