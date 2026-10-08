import { Link } from "react-router-dom";
import { listCollections, setInCollection, type ItemFull } from "../../lib/data";
import { useAsync } from "../../lib/useAsync";

/** Tick the collections this video belongs to. */
export function CollectionsBox({ item, onChanged }: { item: ItemFull; onChanged: () => void }) {
  const all = useAsync(listCollections, []);
  const inside = new Set(item.collections.map((c) => c.id));
  return (
    <section aria-labelledby="collections-h">
      <h2 id="collections-h" className="mb-2 font-serif text-lead font-semibold">Collections</h2>
      {all.data?.length ? (
        <ul>
          {all.data.map((c) => (
            <li key={c.id}>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 sm:min-h-[36px]">
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0 accent-binding sm:h-4 sm:w-4"
                  checked={inside.has(c.id)}
                  onChange={async (e) => {
                    await setInCollection(item.id, c.id, e.target.checked);
                    onChanged();
                  }}
                />
                <span dir="auto" className="min-w-0 text-body">{c.name}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : all.loading ? null : (
        <p className="text-meta text-ink-2">No collections yet. <Link to="/collections" className="text-binding hover:underline">Create a collection</Link></p>
      )}
    </section>
  );
}
