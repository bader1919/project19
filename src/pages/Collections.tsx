import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { createCollection, deleteCollection, listCollections } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { EmptyState, ErrorBox, PageHeader } from "../components/ui";
import { SkeletonRows } from "../components/Skeleton";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { IconButton } from "../components/IconButton";
import { Menu } from "../components/Menu";
import { focusIfLost } from "../lib/focus";

type Col = { id: string; name: string; description: string | null; count: number };

export function Collections() {
  const cols = useAsync(listCollections, []);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Col | null>(null);

  const validate = (v: string) => (v.trim() ? null : "Enter a name for the collection, like “Thesis research”.");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const err = validate(name);
    setNameError(err);
    if (err) { nameRef.current?.focus(); return; }
    setBusy(true);
    setFormError(null);
    try {
      await createCollection(name, description);
      setName("");
      setDescription("");
      cols.reload();
    } catch (e2) {
      const m = (e2 as Error).message;
      if (m.includes("duplicate")) { setNameError("A collection with that name already exists. Use a different name."); nameRef.current?.focus(); }
      else setFormError(`Couldn't create the collection. ${m}`);
    } finally {
      setBusy(false);
    }
  }

  const list = (cols.data ?? []) as Col[];

  return (
    <div className="max-w-list">
      <PageHeader
        title="Collections"
        meta={cols.data ? `${list.length} ${list.length === 1 ? "collection" : "collections"}. Group videos for a project, a course or anything else.` : undefined}
      />

      <form noValidate onSubmit={create} className="mb-8 grid gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] sm:items-start">
        <div>
          <label htmlFor="col-name" className="mb-1 block text-meta font-semibold text-ink-2">Name</label>
          <input
            id="col-name"
            ref={nameRef}
            dir="auto"
            className={`input ${nameError ? "border-danger" : ""}`}
            value={name}
            required
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? "col-name-error" : undefined}
            onChange={(e) => { setName(e.target.value); setNameError(null); }}
          />
          {nameError && <p id="col-name-error" role="alert" className="mt-1 text-meta text-danger">{nameError}</p>}
        </div>
        <div>
          <label htmlFor="col-desc" className="mb-1 block text-meta font-semibold text-ink-2">Description (optional)</label>
          <input id="col-desc" dir="auto" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <button className="btn-primary sm:mt-[26px]" disabled={busy}>{busy ? "Creating…" : "Create collection"}</button>
      </form>
      {formError && <div className="mb-4"><ErrorBox message={formError} /></div>}

      {cols.error && !cols.data ? (
        <ErrorBox message="Couldn't load your collections. Check your connection and try again." onRetry={cols.reload} />
      ) : cols.loading && !cols.data ? (
        <SkeletonRows thumb={false} n={4} />
      ) : list.length === 0 ? (
        <EmptyState
          title="No collections yet"
          action={<button type="button" className="btn-outline" onClick={() => nameRef.current?.focus()}>Name your first collection</button>}
        >
          A collection keeps the videos for one project together. Name one above, then add videos from their pages.
        </EmptyState>
      ) : (
        <ul className="grid sm:grid-cols-2 sm:gap-x-10">
          {list.map((c) => (
            <li key={c.id} dir={/[\u0590-\u08FF]/.test(c.name + (c.description ?? "")) ? "rtl" : "ltr"} className="row group flex items-start gap-2">
              <Link to={`/library?collection=${c.id}`} className="min-w-0 flex-1">
                <p dir="auto" className="truncate font-serif text-[1.125rem] font-semibold leading-7 group-hover:text-binding">{c.name}</p>
                {c.description && <p dir="auto" className="line-clamp-2 text-meta text-ink-2">{c.description}</p>}
                <p className="text-meta text-ink-2"><bdi>{c.count} {c.count === 1 ? "video" : "videos"}</bdi></p>
              </Link>
              <div className="hidden sm:block [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
                <IconButton label={`Delete collection ${c.name}`} onClick={() => setDeleting(c)}><Trash2 className="h-4 w-4" aria-hidden="true" /></IconButton>
              </div>
              <Menu
                className="sm:hidden"
                align="end"
                label={`More actions for ${c.name}`}
                trigger={<MoreHorizontal className="h-5 w-5" aria-hidden="true" />}
                items={[{ label: "Delete collection", icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, danger: true, onSelect: () => setDeleting(c) }]}
              />
            </li>
          ))}
        </ul>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete collection “${deleting.name}”?`}
          body={`The ${deleting.count === 1 ? "video stays" : `${deleting.count} videos stay`} in your library. Only the collection is removed.`}
          confirmLabel="Delete collection"
          danger
          onConfirm={async () => { await deleteCollection(deleting.id); cols.reload(); }}
          onClose={() => { setDeleting(null); focusIfLost("main"); }}
        />
      )}
    </div>
  );
}
