import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { LinkRow as LinkData } from "../lib/data";
import { IconButton } from "./IconButton";
import { Locator } from "./Locator";
import { safeHref } from "../lib/url";

const RTL = /[֐-ࣿ]/;

export type LinkRowData = LinkData & { items?: { title: string } };

/**
 * One saved link as a list row. The label opens the URL (the whole row is the hit area); the locator tab
 * goes to the video at that moment; "From {video}" opens the video at the same moment.
 * Arabic rows mirror as a whole (`dir` follows the label and context).
 * - `compact`: for use inside a video page (no "From" line).
 * - `onSeek`: seek the player in place instead of navigating (video page).
 * - `actions`: extra end-side controls (e.g. edit and remove on the video page).
 */
export function LinkRow({
  link, compact = false, onSeek, actions,
}: {
  link: LinkRowData;
  compact?: boolean;
  onSeek?: (sec: number) => void;
  actions?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const href = safeHref(link.url);
  const label = link.label || link.domain || link.url;
  const domain = (link.domain ?? "").replace(/^www\./, "");
  const rtl = RTL.test(`${link.label ?? ""}${link.context ?? ""}`);
  const at = link.timestamp_sec;
  const fromTo = `/item/${link.item_id}${at !== null ? `?t=${Math.floor(at)}` : ""}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: the URL stays available through Open */
    }
  };

  return (
    <li dir={rtl ? "rtl" : "ltr"} className="row group relative flex items-start gap-3">
      <div className="min-w-0 flex-1">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            title={link.url}
            className="block break-words text-[1.0625rem] font-medium leading-6 after:absolute after:inset-0 hover:text-binding hover:underline"
          >
            {label}
          </a>
        ) : (
          <span className="block break-words text-[1.0625rem] font-medium leading-6">{label}</span>
        )}
        {(domain || link.context) && (
          <p className="mt-0.5 line-clamp-2 text-meta text-ink-2">
            {domain && <bdi dir="ltr" className="font-medium text-binding">{domain}</bdi>}
            {domain && link.context && <span className="ms-3" />}
            {link.context && <span>{link.context}</span>}
          </p>
        )}
        {!compact && link.items && (
          <Link
            to={fromTo}
            className="relative z-10 mt-1 block max-w-full truncate text-meta text-ink-2 hover:text-binding hover:underline"
          >
            From <bdi>{link.items.title}</bdi>
          </Link>
        )}
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-0.5">
        <span className="flex gap-0.5 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
          <IconButton label={copied ? "Copied" : "Copy link"} onClick={copy}>
            {copied ? <Check className="h-4 w-4 text-binding" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          </IconButton>
          {href && (
            <a href={href} target="_blank" rel="noreferrer" aria-label="Open link in a new tab" title="Open link in a new tab" className="icon-btn">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
          {actions}
        </span>
        <span className="ms-1 sm:ms-2">
          {onSeek ? (
            <Locator sec={at} onSeek={onSeek} label={label} />
          ) : (
            <Locator sec={at} to={fromTo} label={label} />
          )}
        </span>
      </div>
    </li>
  );
}
