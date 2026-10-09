import { useState } from "react";
import { formatTimestamp } from "../../lib/format";

export interface StripMark { sec: number; label: string; kind: "link" | "mention" }
export interface StripChapter { sec: number; title: string }

/**
 * The map of the video: chapters as segments, links (tall) and mentions (short) as yellow ticks, the last seek as a green playhead.
 * Always LTR (time runs left to right, also on Arabic pages). Hidden when there is no duration or nothing to show.
 */
export function TimelineStrip({
  duration, chapters, marks, playhead, onSeek,
}: {
  duration: number | null | undefined;
  chapters: StripChapter[];
  marks: StripMark[];
  playhead: number | null;
  onSeek: (sec: number) => void;
}) {
  const [tip, setTip] = useState<{ pct: number; text: string } | null>(null);
  if (!duration || duration <= 0 || (!chapters.length && !marks.length)) return null;
  const pct = (s: number) => Math.min(100, Math.max(0, (s / duration) * 100));

  const sorted = [...chapters].filter((c) => c.sec < duration).sort((a, b) => a.sec - b.sec);
  const segs = sorted.map((c, i) => ({ ...c, end: sorted[i + 1]?.sec ?? duration }));
  // Without chapters the ruler is one plain segment.
  const base = segs.length ? segs : [{ sec: 0, end: duration, title: "" }];
  const show = (sec: number, text: string) => setTip({ pct: pct(sec), text: `${text}, ${formatTimestamp(sec)}` });

  return (
    <div dir="ltr" role="group" aria-label="Timeline of this video" className="relative mt-3 select-none">
      {tip && (
        <div
          role="tooltip"
          className="popover pointer-events-none absolute bottom-full z-30 mb-1.5 max-w-[240px] -translate-x-1/2 truncate px-2 py-1 text-small text-ink"
          style={{ left: `clamp(70px, ${tip.pct}%, calc(100% - 70px))` }}
          dir="auto"
        >
          {tip.text}
        </div>
      )}
      <div className="relative h-[14px]">
        {base.map((s, i) => (
          <button
            key={i}
            type="button"
            tabIndex={s.title ? 0 : -1}
            aria-label={s.title ? `Chapter ${s.title}, play from ${formatTimestamp(s.sec)}` : `Play from ${formatTimestamp(s.sec)}`}
            onClick={() => onSeek(s.sec)}
            onMouseEnter={() => s.title && show(s.sec, s.title)}
            onMouseLeave={() => setTip(null)}
            onFocus={() => s.title && show(s.sec, s.title)}
            onBlur={() => setTip(null)}
            className="absolute top-[2px] h-[10px] rounded-[2px] bg-line transition-colors duration-100 hover:bg-ink-2/40 focus-visible:bg-ink-2/40"
            style={{ left: `calc(${pct(s.sec)}% + ${i === 0 ? 0 : 1}px)`, width: `calc(${pct(s.end) - pct(s.sec)}% - ${i === 0 ? 1 : 2}px)` }}
          />
        ))}
        {marks.map((m, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Play from ${formatTimestamp(m.sec)}, ${m.label}`}
            onClick={() => onSeek(m.sec)}
            onMouseEnter={() => show(m.sec, m.label)}
            onMouseLeave={() => setTip(null)}
            onFocus={() => show(m.sec, m.label)}
            onBlur={() => setTip(null)}
            className="group absolute -translate-x-1/2 before:absolute before:-inset-x-2 before:-inset-y-2 before:content-['']"
            style={{ left: `${pct(m.sec)}%`, top: m.kind === "link" ? 0 : 3, height: m.kind === "link" ? 14 : 8, width: 3 }}
          >
            <span className="absolute inset-0 rounded-[1px] bg-marker ring-1 ring-paper group-hover:brightness-90 group-focus-visible:ring-2 group-focus-visible:ring-binding" />
          </button>
        ))}
        {playhead !== null && (
          <span aria-hidden="true" className="pointer-events-none absolute -top-px bottom-[-1px] w-[3px] -translate-x-1/2 rounded-[1px] bg-binding ring-1 ring-paper" style={{ left: `${pct(playhead)}%` }} />
        )}
      </div>
    </div>
  );
}
