import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { timeAgo as timeAgoImpl } from "../lib/format";

/** Inline busy indicator for short actions (under ~1s). Lists use <SkeletonRows /> instead. */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-meta text-ink-2" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {label ?? "Loading…"}
    </div>
  );
}

/** Failure row. Say what failed and how to fix it; pass `onRetry` to show a "Try again" button. */
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-s-4 border-danger bg-danger/10 px-4 py-3 text-body text-ink" role="alert">
      <span className="min-w-0" dir="auto">{message}</span>
      {onRetry && <button type="button" className="btn-outline btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

/** Empty or filtered-zero state: a heading, one sentence, one action. No illustration. */
export function EmptyState({
  title, children, action,
}: {
  title: string;
  children?: ReactNode;
  /** Primary next step, e.g. <button className="btn-primary">Save a video</button>. */
  action?: ReactNode;
}) {
  return (
    <div className="py-12">
      <h2 className="text-h2">{title}</h2>
      {children && <div className="mt-2 max-w-prose text-body text-ink-2">{children}</div>}
      {action && <div className="mt-5 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/** Page title (serif) with an optional one-line meta and right-aligned actions. */
export function PageHeader({
  title, meta, actions,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const line = meta;
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 dir="auto" className="text-title max-sm:text-[1.5rem] max-sm:leading-[1.875rem]">{title}</h1>
        {line && <p className="mt-1 text-meta text-ink-2">{line}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

const STATUS: Record<string, { short: string; long: string }> = {
  fetched: { short: "Summarizing", long: "Summarizing, usually within two minutes" },
  transcript_pending: { short: "Getting transcript", long: "Getting transcript, usually under a minute" },
  error: { short: "Needs attention", long: "Needs attention" },
};

/**
 * Status as plain text with a dot. Renders nothing for "analyzed" (done is the default).
 * `long` adds the expected wait ("Summarizing, usually within two minutes").
 */
export function StatusNote({ status, long = false }: { status: string; long?: boolean }) {
  if (status === "analyzed") return null;
  const s = STATUS[status] ?? { short: status, long: status };
  return (
    <span className="inline-flex items-center gap-1.5 text-small text-warn-ink">
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full bg-warn-ink ${status === "error" ? "" : "animate-pulse-soft"}`} />
      {long ? s.long : s.short}
    </span>
  );
}


/** Render a search snippet where matches are wrapped in [[ ]] by Postgres ts_headline. */
export function Highlight({ text }: { text: string }) {
  const parts = text.split(/(\[\[.*?\]\])/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith("[[") && p.endsWith("]]") ? <mark key={i}>{p.slice(2, -2)}</mark> : <span key={i}>{p}</span>))}
    </>
  );
}

/** Re-exported for existing imports; the implementation lives in lib/format.ts. */
export const timeAgo = timeAgoImpl;
