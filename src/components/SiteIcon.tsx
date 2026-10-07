/** Local favicon stand-in: a coloured initial, so link domains are never sent to a third party. */
export function SiteIcon({ domain, className = "h-5 w-5" }: { domain: string | null; className?: string }) {
  const d = (domain ?? "").replace(/^www\./, "");
  const hue = [...d].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded text-[10px] font-semibold uppercase text-white ${className}`}
      style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}
    >
      {d.charAt(0) || "?"}
    </span>
  );
}

/** Only render http(s) links as clickable (data comes from video descriptions and AI output). */
export function safeHref(url: string | null | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}
