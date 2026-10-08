import { Link } from "react-router-dom";
import { Inbox, Link2, NotebookPen, PlaySquare, Sparkles } from "lucide-react";
import { libraryStats, searchItems } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { ItemCard } from "../components/ItemCard";
import { EmptyState, ErrorBox, PageHeader, Spinner } from "../components/ui";

function Stat({ icon: Icon, label, value, to }: { icon: typeof Inbox; label: string; value: number; to: string }) {
  return (
    <Link to={to} className="card flex items-center gap-3 p-4 transition hover:shadow-md">
      <div className="rounded-lg bg-brand-50 p-2 text-brand-600 dark:bg-brand-500/10 dark:text-brand-100">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-semibold leading-none">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{label}</p>
      </div>
    </Link>
  );
}

export function Home() {
  const stats = useAsync(libraryStats, []);
  const recent = useAsync(() => searchItems({ limit: 6 }), []);
  const pending = useAsync(() => searchItems({ status: "fetched", limit: 6 }), []);
  const noTranscript = useAsync(() => searchItems({ status: "transcript_pending", limit: 6 }), []);

  return (
    <div>
      <PageHeader title="Home" subtitle="Your references from videos, in one searchable place." />

      {stats.data && (
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon={PlaySquare} label="Saved items" value={stats.data.items} to="/library" />
          <Stat icon={Sparkles} label="Being summarized" value={stats.data.pending} to="/library?status=fetched" />
          <Stat icon={Link2} label="Links kept" value={stats.data.links} to="/links" />
          <Stat icon={NotebookPen} label="Notes" value={stats.data.notes} to="/notes" />
        </div>
      )}

      {(pending.data?.length ?? 0) > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Being summarized</h2>
            <p className="text-xs text-slate-500">Automatic — ready in a minute or two</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pending.data!.map((i) => <ItemCard key={i.id} item={i} />)}
          </div>
        </section>
      )}

      {(noTranscript.data?.length ?? 0) > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-semibold">Getting transcript</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {noTranscript.data!.map((i) => <ItemCard key={i.id} item={i} />)}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Recently saved</h2>
          <Link to="/library" className="text-sm text-brand-600 hover:underline">See all</Link>
        </div>
        {recent.loading ? (
          <Spinner />
        ) : recent.error ? (
          <ErrorBox message={recent.error} />
        ) : recent.data!.length === 0 ? (
          <EmptyState icon={<Inbox className="h-10 w-10" />} title="Your library is empty">
            Click <strong>Save a video</strong>, or tell Claude “save this video to RefVault: &lt;link&gt;”.
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.data!.map((i) => <ItemCard key={i.id} item={i} />)}
          </div>
        )}
      </section>
    </div>
  );
}
