/**
 * Loading placeholders. They fade in after `delay` ms (default 300) so fast loads never flash a loader;
 * under reduced motion the pulse is static (see index.css).
 */
const lazyIn = "lazy-in";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** List-row skeleton: 128x72 block + three lines. Pass thumb={false} for text-only rows. */
export function SkeletonRows({ n = 6, thumb = true, delay = 300 }: { n?: number; thumb?: boolean; delay?: number }) {
  return (
    <div role="status" aria-label="Loading" className={lazyIn} style={{ ["--skeleton-delay" as string]: `${delay}ms` }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="row flex gap-4">
          {thumb && <Skeleton className="h-[54px] w-24 shrink-0 sm:h-[72px] sm:w-32" />}
          <div className="min-w-0 flex-1 space-y-2.5 pt-1">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-full" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading</span>
    </div>
  );
}
