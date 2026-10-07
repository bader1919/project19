import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Check, Clock, Copy, ExternalLink, FileText, Link2, ListChecks, MessageSquareQuote, Pencil, Plus,
  RefreshCw, Sparkles, Trash2, X,
} from "lucide-react";
import { formatTimestamp } from "../../shared/youtube-url";
import type { DescriptionInfo } from "../../shared/types";
import {
  addLink, addNote, addTopic, deleteItem, deleteLink, deleteNote, listCollections, loadItem, removeTopic, saveNote,
  setInCollection, updateItem, updateLink, type ItemFull, type LinkRow, type NoteRow,
} from "../lib/data";
import { api } from "../lib/api";
import { useAsync } from "../lib/useAsync";
import { ErrorBox, Spinner, StatusBadge } from "../components/ui";

type Tab = "overview" | "links" | "transcript" | "description";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn-ghost px-2 py-1 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      aria-label={label}
      title={label}
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function TimeButton({ sec, onSeek }: { sec: number | null | undefined; onSeek: (s: number) => void }) {
  if (sec === null || sec === undefined) return null;
  return (
    <button className="chip shrink-0 font-mono hover:bg-brand-100 dark:hover:bg-brand-500/20" onClick={() => onSeek(sec)} title="Play from here">
      <Clock className="h-3 w-3" /> {formatTimestamp(sec)}
    </button>
  );
}

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all text-brand-600 hover:underline">{p}</a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Section({ title, icon, children, action }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">{icon}{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SummarySection({ item, onSaved }: { item: ItemFull; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(item.summary ?? "");
  const [points, setPoints] = useState((item.key_points ?? []).join("\n"));
  useEffect(() => {
    setSummary(item.summary ?? "");
    setPoints((item.key_points ?? []).join("\n"));
  }, [item.summary, item.key_points]);

  return (
    <Section
      title="Summary"
      icon={<Sparkles className="h-4 w-4 text-brand-500" />}
      action={!editing && (
        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
      )}
    >
      {editing ? (
        <div className="space-y-3">
          <textarea dir="auto" className="input h-32" value={summary} onChange={(e) => setSummary(e.target.value)} aria-label="Summary" />
          <label className="block text-xs font-medium text-slate-500">Key points (one per line)</label>
          <textarea dir="auto" className="input h-32" value={points} onChange={(e) => setPoints(e.target.value)} aria-label="Key points" />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button
              className="btn-primary"
              onClick={async () => {
                await updateItem(item.id, { summary, key_points: points.split("\n").map((p) => p.trim()).filter(Boolean) });
                setEditing(false);
                onSaved();
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : item.summary ? (
        <>
          <p dir="auto" className="whitespace-pre-line leading-relaxed text-slate-700 dark:text-slate-300">{item.summary}</p>
          {item.key_points?.length > 0 && (
            <ul dir="auto" className="mt-4 space-y-2">
              {item.key_points.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-100">
          Not analyzed yet. In Claude, say: <em>“Analyze this RefVault video: {item.title}”</em> — or write your own summary with Edit.
          <CopyButton text={`Analyze this RefVault item ${item.id} (${item.title}) and save the analysis.`} label="Copy prompt for Claude" />
        </div>
      )}
    </Section>
  );
}

const KIND_LABEL: Record<string, string> = {
  tool: "Tools", resource: "Resources", code: "Codes & discounts", requirement: "Requirements",
  sponsor: "Sponsors", social: "Social", other: "Other",
};

function DescriptionInfoSection({ info, onSeek }: { info: DescriptionInfo[]; onSeek: (s: number) => void }) {
  const chapters = info.filter((d) => d.kind === "chapter");
  const rest = info.filter((d) => d.kind !== "chapter");
  const groups = rest.reduce<Record<string, DescriptionInfo[]>>((acc, d) => ((acc[d.kind] ??= []).push(d), acc), {});
  if (!info.length) return null;
  return (
    <Section title="From the description" icon={<FileText className="h-4 w-4 text-sky-500" />}>
      <div className="space-y-4">
        {Object.entries(groups).map(([kind, list]) => (
          <div key={kind}>
            <p className="section-title mb-1.5">{KIND_LABEL[kind] ?? kind}</p>
            <ul className="space-y-1.5 text-sm" dir="auto">
              {list.map((d, i) => (
                <li key={i}>
                  {d.text}
                  {d.url && (
                    <a href={d.url} target="_blank" rel="noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 text-brand-600 hover:underline">
                      link <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {chapters.length > 0 && (
          <div>
            <p className="section-title mb-1.5">Chapters</p>
            <ul className="space-y-1 text-sm">
              {chapters.map((c, i) => (
                <li key={i} className="flex items-center gap-2" dir="auto">
                  <TimeButton sec={c.timestamp_sec} onSeek={onSeek} /> <span>{c.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}

function MentionsSection({ item, onSeek }: { item: ItemFull; onSeek: (s: number) => void }) {
  const mentions = item.video?.mentions ?? [];
  if (!mentions.length) return null;
  return (
    <Section title="Mentioned in the video" icon={<MessageSquareQuote className="h-4 w-4 text-violet-500" />}>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {mentions.map((m, i) => (
          <li key={i} className="flex items-start gap-3 py-2.5 text-sm" dir="auto">
            <span className="chip shrink-0 capitalize">{m.kind}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {m.url ? <a href={m.url} target="_blank" rel="noreferrer" className="hover:underline">{m.name}</a> : m.name}
              </p>
              {m.context && <p className="text-slate-500">{m.context}</p>}
            </div>
            <TimeButton sec={m.timestamp_sec} onSeek={onSeek} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function LinkRowView({ link, onSeek, onChanged }: { link: LinkRow; onSeek: (s: number) => void; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(link.label ?? "");
  return (
    <li className="group flex items-start gap-3 py-3">
      <img src={`https://www.google.com/s2/favicons?domain=${link.domain}&sz=32`} alt="" className="mt-0.5 h-5 w-5 rounded" loading="lazy" />
      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              await updateLink(link.id, { label });
              setEditing(false);
              onChanged();
            }}
          >
            <input dir="auto" className="input py-1" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus aria-label="Link label" />
            <button className="btn-primary py-1">Save</button>
          </form>
        ) : (
          <p dir="auto" className="font-medium">{link.label || link.domain}</p>
        )}
        <a href={link.url} target="_blank" rel="noreferrer" className="block truncate text-sm text-brand-600 hover:underline">{link.url}</a>
        {link.context && <p dir="auto" className="mt-0.5 line-clamp-2 text-xs text-slate-500">{link.context}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <TimeButton sec={link.timestamp_sec} onSeek={onSeek} />
        <span className="chip hidden sm:inline-flex">{link.source}</span>
        <CopyButton text={link.url} label="Copy link" />
        <button className="btn-ghost px-2 py-1" onClick={() => setEditing((v) => !v)} aria-label="Edit label"><Pencil className="h-3.5 w-3.5" /></button>
        <button
          className="btn-ghost px-2 py-1 hover:text-red-600"
          aria-label="Delete link"
          onClick={async () => {
            if (confirm("Remove this link?")) {
              await deleteLink(link.id);
              onChanged();
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

function LinksTab({ item, onSeek, onChanged }: { item: ItemFull; onSeek: (s: number) => void; onChanged: () => void }) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="card p-4 sm:p-5">
      {item.links.length === 0 ? (
        <p className="text-sm text-slate-500">No links found in this video's description or captions. Add one below.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {item.links.map((l) => <LinkRowView key={l.id} link={l} onSeek={onSeek} onChanged={onChanged} />)}
        </ul>
      )}
      <form
        className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await addLink(item.id, url.trim(), label.trim());
            setUrl("");
            setLabel("");
            setError(null);
            onChanged();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <input className="input" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} required aria-label="New link URL" />
        <input dir="auto" className="input sm:w-56" placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="New link label" />
        <button className="btn-outline shrink-0"><Plus className="h-4 w-4" /> Add link</button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function TranscriptTab({ item, onSeek, onChanged }: { item: ItemFull; onSeek: (s: number) => void; onChanged: () => void }) {
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const segs = item.video?.transcript_segments ?? [];
  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? segs.filter((s) => s.text.toLowerCase().includes(f)) : segs;
  }, [segs, filter]);

  const retry = async (transcript?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ ok: boolean; error?: string }>("/api/ingest", { body: { item_id: item.id, transcript } });
      if (r.ok) onChanged();
      else setMessage(r.error ?? "Still no transcript");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!item.video?.transcript) {
    return (
      <div className="card space-y-3 p-4 text-sm sm:p-5">
        <p>No transcript yet.{item.error && <span className="block text-xs text-slate-500">{item.error}</span>}</p>
        <p className="text-xs text-slate-500">
          Tip: add a free Supadata key in Settings — it can also transcribe videos that have no captions.
        </p>
        <button className="btn-outline" onClick={() => retry()} disabled={busy}>
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Try again
        </button>
        <textarea dir="auto" className="input h-32" placeholder="…or paste the transcript here" value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Paste transcript" />
        <button className="btn-primary" disabled={!paste.trim() || busy} onClick={() => retry(paste)}>Save pasted transcript</button>
        {message && <p className="text-red-600">{message}</p>}
      </div>
    );
  }

  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input dir="auto" className="input max-w-xs" placeholder="Find in transcript…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find in transcript" />
        <span className="text-xs text-slate-500">
          {item.video.transcript_source && `from ${item.video.transcript_source}`}
          {item.video.transcript_lang && ` · ${item.video.transcript_lang}`}
        </span>
        <span className="ml-auto"><CopyButton text={item.video.transcript} label="Copy transcript" /></span>
      </div>
      {segs.length ? (
        <ol dir="auto" className="max-h-[32rem] space-y-1 overflow-y-auto pr-1 text-sm">
          {shown.map((s, i) => (
            <li key={i}>
              <button className="flex w-full gap-3 rounded px-1.5 py-1 text-start hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => onSeek(Math.floor(s.start))}>
                <span className="w-12 shrink-0 font-mono text-xs leading-5 text-slate-400">{formatTimestamp(s.start)}</span>
                <span className="leading-5">{s.text}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p dir="auto" className="max-h-[32rem] overflow-y-auto whitespace-pre-line text-sm leading-relaxed">{item.video.transcript}</p>
      )}
    </div>
  );
}

function NoteEditor({ note, onDeleted }: { note: NoteRow; onDeleted: () => void }) {
  const [body, setBody] = useState(note.body);
  const [state, setState] = useState<"saved" | "dirty" | "saving">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(body);
  latest.current = body;

  // Autosave 800 ms after typing stops; flush on unmount.
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      saveNote(note.id, latest.current);
    }
  }, [note.id]);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700">
      <textarea
        dir="auto"
        className="block min-h-28 w-full resize-y rounded-t-lg bg-transparent p-3 text-sm focus:outline-none"
        placeholder="Write anything: why it matters, what to try, where you'll use it…"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setState("dirty");
          clearTimeout(timer.current);
          timer.current = setTimeout(async () => {
            timer.current = undefined;
            setState("saving");
            await saveNote(note.id, latest.current);
            setState("saved");
          }, 800);
        }}
        aria-label="Note"
      />
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400 dark:border-slate-800">
        <span>{state === "saved" ? "Saved" : state === "saving" ? "Saving…" : "Editing…"}</span>
        <button
          className="hover:text-red-600"
          onClick={async () => {
            if (confirm("Delete this note?")) {
              clearTimeout(timer.current);
              timer.current = undefined;
              await deleteNote(note.id);
              onDeleted();
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function TopicsEditor({ item, onChanged }: { item: ItemFull; onChanged: () => void }) {
  const [name, setName] = useState("");
  return (
    <div>
      <p className="section-title mb-2">Topics</p>
      <div className="flex flex-wrap gap-1.5">
        {item.topics.map((t) => (
          <span key={t.id} className="chip" dir="auto">
            <Link to={`/library?tag=${encodeURIComponent(t.name)}`} className="hover:underline">{t.name}</Link>
            <button onClick={async () => (await removeTopic(item.id, t.id), onChanged())} aria-label={`Remove topic ${t.name}`} className="hover:text-red-600">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {!item.topics.length && <span className="text-xs text-slate-400">No topics yet</span>}
      </div>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await addTopic(item.id, name);
          setName("");
          onChanged();
        }}
      >
        <input dir="auto" className="input py-1.5" placeholder="Add topic" value={name} onChange={(e) => setName(e.target.value)} aria-label="Add topic" />
        <button className="btn-outline px-2.5 py-1.5" aria-label="Add topic"><Plus className="h-4 w-4" /></button>
      </form>
    </div>
  );
}

function CollectionsEditor({ item, onChanged }: { item: ItemFull; onChanged: () => void }) {
  const all = useAsync(listCollections, []);
  const inside = new Set(item.collections.map((c) => c.id));
  if (!all.data?.length) {
    return (
      <div>
        <p className="section-title mb-2">Collections</p>
        <Link to="/collections" className="text-xs text-brand-600 hover:underline">Create a collection</Link>
      </div>
    );
  }
  return (
    <div>
      <p className="section-title mb-2">Collections</p>
      <div className="space-y-1">
        {all.data.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={inside.has(c.id)}
              onChange={async (e) => {
                await setInCollection(item.id, c.id, e.target.checked);
                onChanged();
              }}
            />
            <span dir="auto">{c.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function ItemPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: item, error, loading, reload } = useAsync(() => loadItem(id), [id]);
  const [tab, setTab] = useState<Tab>("overview");
  const [start, setStart] = useState<number | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  const seek = (sec: number) => {
    setStart(sec);
    playerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (loading && !item) return <Spinner />;
  if (error) return <ErrorBox message={error} />;
  if (!item) return <ErrorBox message="This item doesn't exist (or was deleted)." />;

  const v = item.video;
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "links", label: "Links", count: item.links.length },
    { id: "transcript", label: "Transcript" },
    { id: "description", label: "Description" },
  ];

  return (
    <div>
      <button className="btn-ghost -ml-2 mb-3 px-2 text-xs" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {v && (
            <div ref={playerRef} className="aspect-video overflow-hidden rounded-xl bg-black shadow">
              <iframe
                key={start ?? "initial"}
                className="h-full w-full"
                src={`https://www.youtube-nocookie.com/embed/${v.youtube_id}?rel=0${start !== null ? `&start=${start}&autoplay=1` : ""}`}
                title={item.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <StatusBadge status={item.status} />
              {item.topics.map((t) => (
                <Link key={t.id} to={`/library?tag=${encodeURIComponent(t.name)}`} className="chip hover:bg-slate-200" dir="auto">{t.name}</Link>
              ))}
            </div>
            <h1 dir="auto" className="text-xl font-semibold leading-snug sm:text-2xl">{item.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {v?.channel && (v.channel_url ? <a href={v.channel_url} target="_blank" rel="noreferrer" className="hover:underline" dir="auto">{v.channel}</a> : v.channel)}
              {v?.published_at && ` · ${new Date(v.published_at).toLocaleDateString()}`}
              {v?.duration_sec ? ` · ${formatTimestamp(v.duration_sec)}` : ""}
              {` · saved ${new Date(item.created_at).toLocaleDateString()}`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.source_url && (
                <a href={item.source_url} target="_blank" rel="noreferrer" className="btn-outline py-1.5 text-xs">
                  <ExternalLink className="h-3.5 w-3.5" /> Open on YouTube
                </a>
              )}
              <button
                className="btn-danger py-1.5 text-xs"
                onClick={async () => {
                  if (confirm("Delete this item with its links and notes? This can't be undone.")) {
                    await deleteItem(item.id);
                    navigate("/library");
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>

          <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
                  tab === t.id ? "border-brand-500 text-brand-600 dark:text-brand-100" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {t.label}
                {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs dark:bg-slate-800">{t.count}</span>}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <div className="space-y-5">
              <SummarySection item={item} onSaved={reload} />
              {item.links.length > 0 && (
                <Section
                  title={`Links (${item.links.length})`}
                  icon={<Link2 className="h-4 w-4 text-emerald-500" />}
                  action={<button className="text-xs text-brand-600 hover:underline" onClick={() => setTab("links")}>Manage</button>}
                >
                  <ul className="space-y-1.5 text-sm">
                    {item.links.slice(0, 8).map((l) => (
                      <li key={l.id} className="flex items-center gap-2">
                        <img src={`https://www.google.com/s2/favicons?domain=${l.domain}&sz=32`} alt="" className="h-4 w-4 rounded" loading="lazy" />
                        <a href={l.url} target="_blank" rel="noreferrer" className="truncate hover:underline" dir="auto">{l.label || l.url}</a>
                      </li>
                    ))}
                    {item.links.length > 8 && <li className="text-xs text-slate-500">+{item.links.length - 8} more</li>}
                  </ul>
                </Section>
              )}
              <MentionsSection item={item} onSeek={seek} />
              <DescriptionInfoSection info={v?.description_info ?? []} onSeek={seek} />
            </div>
          )}
          {tab === "links" && <LinksTab item={item} onSeek={seek} onChanged={reload} />}
          {tab === "transcript" && <TranscriptTab item={item} onSeek={seek} onChanged={reload} />}
          {tab === "description" && (
            <div className="card p-4 sm:p-5">
              <p dir="auto" className="whitespace-pre-line break-words text-sm leading-relaxed">
                {v?.description ? <Linkified text={v.description} /> : "No description."}
              </p>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">My notes</h2>
              <button className="btn-ghost px-2 py-1 text-xs" onClick={async () => (await addNote(item.id), reload())}>
                <Plus className="h-3.5 w-3.5" /> New
              </button>
            </div>
            <div className="space-y-3">
              {item.notes.map((n) => <NoteEditor key={n.id} note={n} onDeleted={reload} />)}
              {!item.notes.length && (
                <button className="w-full rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 hover:border-brand-500 hover:text-brand-600 dark:border-slate-700" onClick={async () => (await addNote(item.id), reload())}>
                  + Add your first note
                </button>
              )}
            </div>
          </section>
          <section className="card space-y-5 p-4">
            <TopicsEditor item={item} onChanged={reload} />
            <CollectionsEditor item={item} onChanged={reload} />
          </section>
        </aside>
      </div>
    </div>
  );
}
