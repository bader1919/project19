import { useEffect, useRef, useState } from "react";
import { ExternalLink, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { addLink, deleteLink, updateLink, type ItemFull, type LinkRow } from "../../lib/data";
import { Locator } from "../Locator";
import { IconButton } from "../IconButton";
import { Menu } from "../Menu";
import { ConfirmDialog } from "../ConfirmDialog";
import { safeHref } from "../../lib/url";
import { Block, CopyButton, type SeekFn } from "./shared";

const RTL = /[֐-ࣿ]/;

/** Where the link came from, in plain words (only the non-obvious ones). */
const SOURCE: Record<string, string> = { manual: "added by you", captions: "said in the video", transcript: "said in the video" };

/**
 * One link of the video. The label edits in place: display and input share one grid cell of fixed height, so nothing moves.
 * Enter saves, Esc cancels. Copy, open and the overflow menu show on hover or focus on desktop and always on touch.
 */
function LinkItem({ link, onSeek, onChanged, onRemove }: { link: LinkRow; onSeek: SeekFn; onChanged: () => void; onRemove: (l: LinkRow) => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(link.label ?? "");
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const name = link.label || link.domain || link.url;
  const rtl = RTL.test(`${link.label ?? ""}${link.context ?? ""}`);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);

  const save = async () => {
    const next = label.trim();
    if (next === (link.label ?? "")) return setEditing(false);
    try {
      await updateLink(link.id, { label: next });
      setEditing(false);
      setError(null);
      onChanged();
    } catch {
      setError("Couldn't save the label. Check your connection and try again.");
    }
  };

  const source = SOURCE[link.source];

  return (
    <li className="group border-b border-line py-3" dir={rtl ? "rtl" : undefined}>
      <div className="flex flex-wrap items-start gap-x-3 sm:flex-nowrap">
        <div className="min-w-0 basis-[calc(100%-4.5rem)] sm:basis-0 sm:flex-1">
          {/* label cell: display and input overlap in one 36px box */}
          <div className="grid h-9">
            <a
              href={safeHref(link.url)}
              target="_blank"
              rel="noreferrer"
              dir="auto"
              className={`col-start-1 row-start-1 min-w-0 self-center truncate text-start text-body font-medium hover:underline ${editing ? "invisible" : ""}`}
              tabIndex={editing ? -1 : 0}
              title={link.url}
            >
              {name}
            </a>
            {editing && (
              <input
                ref={input}
                dir="auto"
                className="input col-start-1 row-start-1 h-9 min-h-0 py-0 font-medium sm:min-h-0"
                value={label}
                placeholder={link.domain ?? "Label"}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); void save(); }
                  else if (e.key === "Escape") { e.stopPropagation(); cancelled.current = true; setLabel(link.label ?? ""); setEditing(false); }
                }}
                onBlur={() => {
                  if (cancelled.current) { cancelled.current = false; return; }
                  void save();
                }}
                aria-label="Link label. Enter saves, Escape cancels."
              />
            )}
          </div>
          <p className="-mt-1 truncate text-meta text-ink-2" dir="auto" title={link.url}>
            <span className="text-binding">{link.domain ?? link.url}</span>
            {source ? `, ${source}` : ""}
          </p>
          {link.context && <p dir="auto" className="mt-1 line-clamp-2 max-w-prose text-meta text-ink-2">{link.context}</p>}
          {error && <p role="alert" className="mt-1 text-meta text-danger">{error}</p>}
        </div>
        <div className="mt-1.5 shrink-0 sm:order-last"><Locator sec={link.timestamp_sec} onSeek={onSeek} label={name} /></div>
        <div className="-ms-2 flex basis-full items-center sm:ms-0 sm:basis-auto [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:transition-opacity [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
          <CopyButton text={link.url} label={`Copy link to ${name}`} />
          <IconButton label={`Open ${name} in a new tab`} onClick={() => window.open(safeHref(link.url), "_blank", "noopener,noreferrer")} disabled={!safeHref(link.url)}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </IconButton>
          <Menu
            label={`More actions for ${name}`}
            align="end"
            trigger={<MoreHorizontal className="h-5 w-5" aria-hidden="true" />}
            items={[
              { label: "Edit label", icon: <Pencil className="h-4 w-4" aria-hidden="true" />, onSelect: () => { setLabel(link.label ?? ""); setEditing(true); } },
              { label: "Remove link", danger: true, icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, onSelect: () => onRemove(link) },
            ]}
          />
        </div>
      </div>
    </li>
  );
}

function AddLinkForm({ itemId, onAdded }: { itemId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  if (!open) {
    return (
      <button ref={trigger} type="button" className="btn-outline btn-sm mt-4" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Add link
      </button>
    );
  }
  const close = () => {
    setOpen(false);
    setError(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  return (
    <form
      className="mt-4 grid max-w-xl gap-3 sm:grid-cols-[1fr_12rem]"
      onKeyDown={(e) => e.key === "Escape" && close()}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await addLink(itemId, url.trim(), label.trim());
          setUrl("");
          setLabel("");
          setError(null);
          setOpen(false);
          onAdded();
        } catch (err) {
          setError(`${(err as Error).message}. Paste a full web address like https://example.com.`);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <label htmlFor="new-link-url" className="mb-1 block text-meta font-semibold text-ink-2">Web address</label>
        <input id="new-link-url" className="input" inputMode="url" autoFocus placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} required />
      </div>
      <div>
        <label htmlFor="new-link-label" className="mb-1 block text-meta font-semibold text-ink-2">Label (optional)</label>
        <input id="new-link-label" dir="auto" className="input" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      {error && <p role="alert" className="border-s-4 border-danger bg-danger/10 px-3 py-2 text-meta sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={busy} aria-busy={busy}>{busy ? "Adding…" : "Add link"}</button>
        <button type="button" className="btn-ghost" onClick={close}>Cancel</button>
      </div>
    </form>
  );
}

/** Every link of the video with the full management the old Links tab had. */
export function LinksBlock({ item, working, onSeek, onChanged }: { item: ItemFull; working: boolean; onSeek: SeekFn; onChanged: () => void }) {
  const [removing, setRemoving] = useState<LinkRow | null>(null);
  return (
    <Block id="links" title="Links">
      {item.links.length === 0 ? (
        <p className="max-w-prose text-body text-ink-2">
          {working ? "Links appear when the summary finishes." : "No links found in this video's description or captions. Add one below."}
        </p>
      ) : (
        <ul className="border-t border-line">
          {item.links.map((l) => <LinkItem key={l.id} link={l} onSeek={onSeek} onChanged={onChanged} onRemove={setRemoving} />)}
        </ul>
      )}
      <AddLinkForm itemId={item.id} onAdded={onChanged} />
      {removing && (
        <ConfirmDialog
          title={`Remove “${removing.label || removing.domain || removing.url}” from this video?`}
          body="The link is deleted from RefVault. The video itself is not changed."
          confirmLabel="Remove link"
          danger
          onConfirm={async () => {
            await deleteLink(removing.id);
            onChanged();
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </Block>
  );
}
