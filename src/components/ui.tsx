import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-slate-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label ?? "Loading…"}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" role="alert">
      {message}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 text-slate-400">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  analyzed: { label: "Analyzed", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  fetched: { label: "Needs analysis", cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  transcript_pending: { label: "No transcript", cls: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  error: { label: "Error", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>{s.label}</span>;
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

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
