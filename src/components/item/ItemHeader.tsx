import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, X } from "lucide-react";
import { addTopic, removeTopic, type ItemFull } from "../../lib/data";
import { formatDate, formatTimestamp } from "../../lib/format";
import { safeHref } from "../../lib/url";
import { ErrorBox, StatusNote } from "../ui";

function TopicChips({ item, onChanged }: { item: ItemFull; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);

  // `refocus` is false when the input lost focus because the user went elsewhere: don't pull focus back.
  const close = (refocus = true) => {
    setAdding(false);
    setName("");
    setError(null);
    if (refocus) requestAnimationFrame(() => addBtn.current?.focus());
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {item.topics.map((t) => (
        <span key={t.id} className="chip py-0 ps-2 pe-0" dir="auto">
          <Link to={`/library?tag=${encodeURIComponent(t.name)}`} className="relative py-1 before:absolute before:-inset-2 before:content-[''] hover:underline">{t.name}</Link>
          <button
            type="button"
            aria-label={`Remove topic ${t.name}`}
            title={`Remove topic ${t.name}`}
            className="relative flex h-7 w-7 items-center justify-center rounded-tab text-ink-2 before:absolute before:-inset-2 before:content-[''] hover:text-danger"
            onClick={async () => {
              try {
                await removeTopic(item.id, t.id);
                onChanged();
              } catch {
                setError("Couldn't remove the topic. Check your connection and try again.");
              }
            }}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      {adding ? (
        <form
          className="flex items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return close();
            try {
              await addTopic(item.id, name);
              setName("");
              setError(null);
              onChanged();
              input.current?.focus();
            } catch {
              setError("Couldn't add the topic. Check your connection and try again.");
            }
          }}
        >
          <input
            ref={input}
            dir="auto"
            autoFocus
            className="input h-9 min-h-0 w-44 py-0 sm:min-h-0"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), close())}
            onBlur={() => !name.trim() && close(false)}
            aria-label="Topic name"
            placeholder="Topic name"
          />
          <button className="btn-outline btn-sm" type="submit">Add topic</button>
        </form>
      ) : (
        <button
          ref={addBtn}
          type="button"
          className="relative inline-flex items-center gap-1 rounded-tab border border-dashed border-ink-2/50 px-2 py-0.5 text-small text-ink-2 before:absolute before:-inset-y-2 before:inset-x-0 before:content-[''] hover:border-binding hover:text-binding"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add topic
        </button>
      )}
      {error && <p role="alert" className="basis-full text-meta text-danger">{error}</p>}
    </div>
  );
}

/** Back link, title, one meta line, topics, and a status note only when the item is not done. */
export function ItemHeader({ item, working, onChanged }: { item: ItemFull; working: boolean; onChanged: () => void }) {
  const navigate = useNavigate();
  const v = item.video;
  const bits: React.ReactNode[] = [];
  if (v?.channel) bits.push(safeHref(v.channel_url) ? <a key="c" href={safeHref(v.channel_url)} target="_blank" rel="noreferrer" className="hover:underline"><bdi>{v.channel}</bdi></a> : <bdi key="c">{v.channel}</bdi>);
  if (v?.duration_sec) bits.push(<span key="d" className="num">{formatTimestamp(v.duration_sec)}</span>);
  if (v?.published_at) bits.push(<span key="p">published {formatDate(v.published_at)}</span>);
  bits.push(<span key="s">saved {formatDate(item.created_at)}</span>);

  return (
    <header>
      <button type="button" className="btn-ghost btn-sm -ms-3 mb-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" /> Library
      </button>
      <h1 dir="auto" className="text-title max-sm:text-[1.5rem] max-sm:leading-[1.875rem]">{item.title}</h1>
      <p className="mt-2 text-meta text-ink-2">
        {bits.map((b, i) => (
          <span key={i}>{i > 0 && ", "}{b}</span>
        ))}
      </p>
      <TopicChips item={item} onChanged={onChanged} />
      {item.status === "error" ? (
        <div className="mt-4">
          <ErrorBox message={`Couldn't finish this video${item.error ? ` (${item.error})` : ""}. Open Transcript to try again or paste the transcript.`} />
        </div>
      ) : item.status !== "analyzed" && working ? (
        <div role="status" className="mt-4 rounded-ctl bg-warn-bg px-3 py-2.5">
          <StatusNote status={item.status} long />
          <span className="text-small text-warn-ink"> This page fills in by itself.</span>
          <div aria-hidden="true" className="mt-2 h-0.5 animate-pulse-soft rounded-full bg-warn-ink/60" />
        </div>
      ) : item.status !== "analyzed" ? (
        <p className="mt-4"><StatusNote status={item.status} /></p>
      ) : null}
    </header>
  );
}
