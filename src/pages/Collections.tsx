import { useState } from "react";
import { Link } from "react-router-dom";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { createCollection, deleteCollection, listCollections } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { EmptyState, ErrorBox, PageHeader, Spinner } from "../components/ui";

export function Collections() {
  const cols = useAsync(listCollections, []);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <PageHeader title="Collections" subtitle="Group items for a project, a course you're building, or anything else." />
      <form
        className="card mb-6 flex flex-col gap-2 p-4 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await createCollection(name, description);
            setName("");
            setDescription("");
            setError(null);
            cols.reload();
          } catch (err) {
            setError((err as Error).message.includes("duplicate") ? "A collection with that name already exists" : (err as Error).message);
          }
        }}
      >
        <input dir="auto" className="input sm:w-64" placeholder="New collection name" value={name} onChange={(e) => setName(e.target.value)} required aria-label="Collection name" />
        <input dir="auto" className="input" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Collection description" />
        <button className="btn-primary shrink-0"><Plus className="h-4 w-4" /> Create</button>
      </form>
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      {cols.loading ? (
        <Spinner />
      ) : cols.error ? (
        <ErrorBox message={cols.error} />
      ) : !cols.data!.length ? (
        <EmptyState icon={<FolderOpen className="h-10 w-10" />} title="No collections yet" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cols.data!.map((c) => (
            <div key={c.id} className="card group flex items-start gap-3 p-4">
              <FolderOpen className="mt-0.5 h-5 w-5 text-brand-500" />
              <Link to={`/library?collection=${c.id}`} className="min-w-0 flex-1">
                <p dir="auto" className="font-medium group-hover:text-brand-600">{c.name}</p>
                {c.description && <p dir="auto" className="text-sm text-slate-500">{c.description}</p>}
                <p className="mt-1 text-xs text-slate-500">{c.count} item{c.count === 1 ? "" : "s"}</p>
              </Link>
              <button
                className="btn-ghost p-1.5 opacity-60 hover:text-red-600 group-hover:opacity-100"
                aria-label={`Delete ${c.name}`}
                onClick={async () => {
                  if (confirm(`Delete collection “${c.name}”? The items stay in your library.`)) {
                    await deleteCollection(c.id);
                    cols.reload();
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
