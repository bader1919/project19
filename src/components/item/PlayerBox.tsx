import { forwardRef, useState } from "react";
import { ExternalLink, MoreHorizontal, Trash2 } from "lucide-react";
import { Menu } from "../Menu";
import { safeHref } from "../../lib/url";
import { ConfirmDialog } from "../ConfirmDialog";
import { TimelineStrip, type StripChapter, type StripMark } from "./TimelineStrip";

/** Video frame, timeline strip and the page-level actions (Open on YouTube, Delete video). The iframe seeks through the `start` param. */
export const PlayerBox = forwardRef<HTMLDivElement, {
  title: string;
  youtubeId: string | null;
  start: number | null;
  duration: number | null | undefined;
  chapters: StripChapter[];
  marks: StripMark[];
  sourceUrl: string | null;
  onSeek: (sec: number) => void;
  onDelete: () => Promise<void>;
}>(function PlayerBox({ title, youtubeId, start, duration, chapters, marks, sourceUrl, onSeek, onDelete }, ref) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div>
      {youtubeId && (
        <div ref={ref} className="aspect-video overflow-hidden rounded-frame border border-line bg-black">
          <iframe
            key={start ?? "initial"}
            className="h-full w-full"
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0${start !== null ? `&start=${start}&autoplay=1` : ""}`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
      <TimelineStrip duration={duration} chapters={chapters} marks={marks} playhead={start} onSeek={onSeek} />
      <div className="mt-3 flex items-center gap-1">
        {safeHref(sourceUrl) && (
          <a href={safeHref(sourceUrl)} target="_blank" rel="noreferrer" className="btn-outline btn-sm">
            <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open on YouTube
          </a>
        )}
        <Menu
          label="More actions"
          align="end"
          className="ms-auto"
          trigger={<MoreHorizontal className="h-5 w-5" aria-hidden="true" />}
          items={[{ label: "Delete video", danger: true, icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, onSelect: () => setConfirming(true) }]}
        />
      </div>
      {confirming && (
        <ConfirmDialog
          title={`Delete “${title}”?`}
          body="Its links, notes and transcript are deleted too. This can't be undone."
          confirmLabel="Delete video"
          danger
          onConfirm={onDelete}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
});
