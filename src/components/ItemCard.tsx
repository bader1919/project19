import { Link } from "react-router-dom";
import { PlaySquare } from "lucide-react";
import type { SearchRow } from "../lib/data";
import { Highlight, StatusBadge, timeAgo } from "./ui";

export function ItemCard({ item, showSnippet }: { item: SearchRow; showSnippet?: boolean }) {
  const text = showSnippet ? item.snippet : item.summary;
  return (
    <Link
      to={`/item/${item.id}`}
      className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-video bg-slate-200 dark:bg-slate-800">
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <PlaySquare className="absolute inset-0 m-auto h-8 w-8 text-slate-400" />
        )}
        <div className="absolute left-2 top-2">
          {item.status !== "analyzed" && <StatusBadge status={item.status} />}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <h3 dir="auto" className="line-clamp-2 font-semibold leading-snug group-hover:text-brand-600 dark:group-hover:text-brand-100">
          {item.title}
        </h3>
        <p className="text-xs text-slate-500">
          {item.channel && <><bdi>{item.channel}</bdi>{" · "}</>}
          {timeAgo(item.created_at)}
        </p>
        {text && (
          <p dir="auto" className="line-clamp-3 text-sm text-slate-600 dark:text-slate-400">
            {showSnippet ? <Highlight text={text} /> : text}
          </p>
        )}
        {item.tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1.5">
            {item.tags.slice(0, 4).map((t) => (
              <span key={t} className="chip" dir="auto">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
