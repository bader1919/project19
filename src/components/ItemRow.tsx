import { Fragment } from "react";
import { Link } from "react-router-dom";
import type { SearchRow } from "../lib/data";
import { formatDate, formatTimestamp } from "../lib/format";
import { Highlight, StatusNote } from "./ui";
import { Thumb } from "./Thumb";

/**
 * One saved item as a list row: thumbnail (start), serif title, meta line, summary or search snippet, topics.
 * The whole row is the link. With `showSnippet` the search snippet (matches in <mark>) replaces the summary.
 */
export function ItemRow({ item, showSnippet }: { item: SearchRow; showSnippet?: boolean }) {
  const text = showSnippet ? item.snippet : item.summary;
  const meta = [
    item.channel ? <bdi key="c">{item.channel}</bdi> : null,
    item.duration_sec ? <bdi key="d" className="num">{formatTimestamp(item.duration_sec)}</bdi> : null,
    <bdi key="t"><time dateTime={item.created_at}>{formatDate(item.created_at)}</time></bdi>,
  ].filter(Boolean);
  const shown = item.tags.slice(0, 3);
  const extra = item.tags.length - shown.length;

  return (
    <Link
      to={`/item/${item.id}`}
      dir={/[\u0590-\u08FF]/.test(item.title) ? "rtl" : "ltr"}
      className="row group flex min-h-[88px] gap-4"
    >
      <Thumb src={item.thumbnail} title={item.title} channel={item.channel} className="h-[54px] w-24 sm:h-[72px] sm:w-32" />
      <div className="min-w-0 flex-1">
        <h3 dir="auto" className="line-clamp-2 font-serif text-[1.125rem] font-semibold leading-[1.625rem] group-hover:text-binding">
          {item.title}
        </h3>
        <p className="mt-0.5 text-meta text-ink-2">
          {meta.map((m, i) => (
            <Fragment key={i}>
              {i > 0 && ", "}
              {m}
            </Fragment>
          ))}
          {item.status !== "analyzed" && <span className="ms-3"><StatusNote status={item.status} /></span>}
        </p>
        {text && (
          <p dir="auto" className={`mt-1.5 line-clamp-2 text-meta text-ink-2 ${showSnippet ? "whitespace-pre-line" : ""}`}>
            {showSnippet ? <Highlight text={text} /> : text}
          </p>
        )}
        {shown.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {shown.map((t) => <span key={t} className="chip" dir="auto">{t}</span>)}
            {extra > 0 && <span className="chip bg-transparent text-ink-2">+{extra}</span>}
          </div>
        )}
      </div>
    </Link>
  );
}
