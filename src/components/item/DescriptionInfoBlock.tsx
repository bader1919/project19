import { ExternalLink } from "lucide-react";
import type { DescriptionInfo } from "../../../shared/types";
import { Locator } from "../Locator";
import { safeHref } from "../../lib/url";
import { Block, asArray, type SeekFn } from "./shared";

const KIND_LABEL: Record<string, string> = {
  tool: "Tools", resource: "Resources", code: "Codes and discounts", requirement: "Requirements",
  sponsor: "Sponsors", social: "Social", other: "Other",
};

export function cleanInfo(info: DescriptionInfo[] | null | undefined): DescriptionInfo[] {
  return asArray(info).filter((d) => d && typeof d.text === "string");
}

/** Chapters, codes and other facts the description lists. Chapters come first because they are the map of the video. */
export function DescriptionInfoBlock({ info, onSeek }: { info: DescriptionInfo[]; onSeek: SeekFn }) {
  const all = cleanInfo(info);
  if (!all.length) return null;
  const chapters = all.filter((d) => d.kind === "chapter");
  const groups = all.filter((d) => d.kind !== "chapter").reduce<Record<string, DescriptionInfo[]>>((acc, d) => ((acc[d.kind] ??= []).push(d), acc), {});
  return (
    <Block id="chapters" title="From the description">
      <div className="space-y-6">
        {chapters.length > 0 && (
          <div>
            <h3 className="mb-1 text-meta font-semibold text-ink-2">Chapters</h3>
            <ul className="divide-y divide-line border-t border-line">
              {chapters.map((c, i) => (
                <li key={i} dir="auto" className="flex items-center gap-3 py-2">
                  <span className="w-[3.25rem] shrink-0"><Locator sec={c.timestamp_sec} onSeek={onSeek} label={c.text} /></span>
                  <span className="min-w-0 flex-1 text-body">{c.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {Object.entries(groups).map(([kind, list]) => (
          <div key={kind}>
            <h3 className="mb-1 text-meta font-semibold text-ink-2">{KIND_LABEL[kind] ?? kind}</h3>
            <ul dir="auto" className="space-y-1.5 text-body">
              {list.map((d, i) => (
                <li key={i}>
                  {d.text}
                  {safeHref(d.url) && (
                    <a href={safeHref(d.url)} target="_blank" rel="noreferrer" className="ms-2 inline-flex items-center gap-1 text-meta text-binding hover:underline">
                      Open link <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Block>
  );
}
