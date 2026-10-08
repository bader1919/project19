import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { deleteItem, loadItem, type ItemFull } from "../lib/data";
import { useAsync } from "../lib/useAsync";
import { ErrorBox, EmptyState } from "../components/ui";
import { Skeleton } from "../components/Skeleton";
import { ContentsBar, scrollToEl, type ContentsEntry } from "../components/item/ContentsBar";
import { ItemHeader } from "../components/item/ItemHeader";
import { PlayerBox } from "../components/item/PlayerBox";
import { SummaryBlock } from "../components/item/SummaryBlock";
import { LinksBlock } from "../components/item/LinksBlock";
import { MentionsBlock } from "../components/item/MentionsBlock";
import { DescriptionInfoBlock, cleanInfo } from "../components/item/DescriptionInfoBlock";
import { TranscriptBlock } from "../components/item/TranscriptBlock";
import { DescriptionBlock } from "../components/item/DescriptionBlock";
import { NotesBox } from "../components/item/NotesBox";
import { CollectionsBox } from "../components/item/CollectionsBox";
import { asArray } from "../components/item/shared";
import type { StripChapter, StripMark } from "../components/item/TimelineStrip";

/** Still being transcribed or summarized automatically. */
function isWorking(item: ItemFull): boolean {
  if (item.status === "transcript_pending") return (item.video?.auto_attempts ?? 0) < 8 || (!item.analyzed_at && (item.analysis_attempts ?? 0) < 5);
  return item.status === "fetched" && !item.analyzed_at && (item.analysis_attempts ?? 0) < 5;
}

function ItemSkeleton() {
  return (
    <div role="status" aria-label="Loading video" className="lazy-in grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-8 w-11/12" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <div className="space-y-3 pt-8">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      </div>
      <Skeleton className="aspect-video w-full !rounded-frame" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

/**
 * Item page: one continuous page (no tabs). Order: header, summary, links, mentions, description facts, transcript, description text.
 * Desktop keeps the player, timeline, notes and collections in a sticky right rail; on mobile the player follows the header
 * and notes and collections come after the sections (the rail wrapper uses display: contents there).
 */
export function ItemPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: item, error, loading, reload } = useAsync(() => loadItem(id), [id]);
  const [start, setStart] = useState<number | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const seekedFor = useRef<string | null>(null);

  // The transcript and summary are made in the background: refresh until they're in.
  const working = !!item && isWorking(item);
  useEffect(() => {
    if (!working) return;
    const t = setInterval(reload, 10_000);
    return () => clearInterval(t);
  }, [working, reload]);

  // ?t=760 opens the video at that second, once per item.
  useEffect(() => {
    if (!item?.video || seekedFor.current === item.id) return;
    seekedFor.current = item.id;
    const t = Number(params.get("t"));
    if (params.get("t") !== null && Number.isFinite(t) && t >= 0) setStart(Math.floor(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, !!item?.video]);

  const seek = (sec: number) => {
    setStart(Math.floor(sec));
    // The rail keeps the player in view on desktop; bring it back only when it has scrolled away.
    const el = playerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 56 || r.bottom > window.innerHeight) scrollToEl(el, "center");
  };

  const info = useMemo(() => cleanInfo(item?.video?.description_info), [item?.video?.description_info]);
  const chapters = useMemo<StripChapter[]>(
    () => info.filter((d) => d.kind === "chapter" && typeof d.timestamp_sec === "number").map((d) => ({ sec: d.timestamp_sec as number, title: d.text })),
    [info],
  );
  const marks = useMemo<StripMark[]>(() => {
    if (!item) return [];
    const links = item.links.filter((l) => l.timestamp_sec !== null).map((l) => ({ sec: l.timestamp_sec as number, label: l.label || l.domain || l.url, kind: "link" as const }));
    const ments = asArray(item.video?.mentions).filter((m) => m && typeof m.name === "string" && typeof m.timestamp_sec === "number")
      .map((m) => ({ sec: m.timestamp_sec as number, label: m.name, kind: "mention" as const }));
    return [...links, ...ments];
  }, [item]);

  if (loading && !item) return <ItemSkeleton />;
  if (error && !item) return <ErrorBox message={`Couldn't load this video. ${error}. Check your connection and try again.`} onRetry={reload} />;
  if (!item) {
    return (
      <EmptyState title="Video not found" action={<Link to="/library" className="btn-primary">Open library</Link>}>
        It doesn't exist or was deleted.
      </EmptyState>
    );
  }

  const v = item.video;
  const mentionCount = asArray(v?.mentions).filter((m) => m && typeof m.name === "string").length;
  const entries: ContentsEntry[] = [
    { id: "summary", label: "Summary" },
    { id: "links", label: "Links", count: item.links.length },
    ...(mentionCount ? [{ id: "mentions", label: "Mentions", count: mentionCount }] : []),
    ...(info.length ? [{ id: "chapters", label: info.some((d) => d.kind === "chapter") ? "Chapters" : "Details" }] : []),
    { id: "transcript", label: "Transcript" },
    { id: "notes", label: "Notes", count: item.notes.length || undefined },
  ];

  return (
    <div className="flex flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-x-10 min-[1440px]:grid-cols-[minmax(0,1fr)_392px] min-[1440px]:gap-x-12">
      <div className="order-1 lg:col-start-1 lg:row-start-1">
        <ItemHeader item={item} working={working} onChanged={reload} />
      </div>

      {/* Right rail on desktop (sticky); on mobile its two children are placed around the sections. */}
      <div className="contents lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:block lg:max-h-[calc(100dvh-5.5rem)] lg:overflow-y-auto lg:sticky lg:top-[4.5rem] lg:pb-4 lg:pe-1">
        <div className="order-2 mt-6 lg:mt-1">
          <PlayerBox
            ref={playerRef}
            title={item.title}
            youtubeId={v?.youtube_id ?? null}
            start={start}
            duration={v?.duration_sec}
            chapters={chapters}
            marks={marks}
            sourceUrl={item.source_url}
            onSeek={seek}
            onDelete={async () => {
              await deleteItem(item.id);
              navigate("/library");
            }}
          />
        </div>
        <div className="order-5 mt-10 space-y-8 lg:mt-8">
          <NotesBox item={item} onChanged={reload} />
          <CollectionsBox item={item} onChanged={reload} />
        </div>
      </div>

      <div className="contents lg:col-start-1 lg:row-start-2 lg:mt-6 lg:block">
        <ContentsBar entries={entries} className="order-3 mt-6 lg:mt-0" />
        <div className="order-4 min-w-0">
          <SummaryBlock item={item} working={working} onSaved={reload} />
          <LinksBlock item={item} working={working} onSeek={seek} onChanged={reload} />
          <MentionsBlock item={item} onSeek={seek} />
          <DescriptionInfoBlock info={info} onSeek={seek} />
          <TranscriptBlock item={item} playing={start} onSeek={seek} onChanged={reload} />
          <DescriptionBlock description={v?.description} />
        </div>
      </div>
    </div>
  );
}
