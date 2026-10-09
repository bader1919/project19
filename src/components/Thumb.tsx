import { useEffect, useState } from "react";
import { formatTimestamp } from "../lib/format";

/**
 * Video thumbnail with a designed fallback (never a broken-image glyph).
 * Size comes from the parent via `className` (e.g. "h-[72px] w-32"); defaults to a 16:9 box that fills its parent width.
 * The image is decorative (alt=""): the title is always next to it.
 */
export function Thumb({
  src, title, channel, duration, className = "aspect-video w-full",
}: {
  src?: string | null;
  title: string;
  channel?: string | null;
  /** Seconds; shows a duration chip bottom-end. */
  duration?: number | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const initial = ((channel || title).trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "R").toUpperCase();
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-tab border border-line bg-binding-wash ${className}`} dir="ltr">
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" width={320} height={180} onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center font-serif text-[24px] font-semibold leading-none text-binding">
          {initial}
        </span>
      )}
      {duration ? (
        <span className="num absolute bottom-1 end-1 rounded-tab bg-sheet px-1 text-small text-ink">{formatTimestamp(duration)}</span>
      ) : null}
    </div>
  );
}
