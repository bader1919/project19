import type { ItemFull } from "../../lib/data";
import { Locator } from "../Locator";
import { safeHref } from "../../lib/url";
import { Block, asArray, type SeekFn } from "./shared";

/** Things said in the video: locator tab first, name, kind as plain text, context below. */
export function MentionsBlock({ item, onSeek }: { item: ItemFull; onSeek: SeekFn }) {
  const mentions = asArray(item.video?.mentions).filter((m) => m && typeof m.name === "string");
  if (!mentions.length) return null;
  return (
    <Block id="mentions" title="Mentioned in the video">
      <ul className="divide-y divide-line border-t border-line">
        {mentions.map((m, i) => (
          <li key={i} dir="auto" className="flex items-start gap-3 py-3">
            <span className="mt-0.5 w-[3.25rem] shrink-0"><Locator sec={m.timestamp_sec} onSeek={onSeek} label={m.name} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-body">
                <span className="font-medium">
                  {safeHref(m.url) ? <a href={safeHref(m.url)} target="_blank" rel="noreferrer" className="text-binding hover:underline">{m.name}</a> : m.name}
                </span>
                {m.kind && <span className="ms-2 text-meta capitalize text-ink-2">{m.kind}</span>}
              </p>
              {m.context && <p className="mt-0.5 max-w-prose text-meta text-ink-2">{m.context}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Block>
  );
}
