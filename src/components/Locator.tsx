import { Link } from "react-router-dom";
import { formatTimestamp } from "../lib/format";

/**
 * The timestamp as a locator tab (the only yellow in the product).
 * - `onSeek`: renders a button that seeks the player ("Play from 12:40").
 * - `to`: renders a router link (e.g. `/item/:id?t=760`).
 * - neither: a static tab.
 * Render nothing when `sec` is null/undefined: the tab is omitted, never replaced by a dash.
 */
export function Locator({
  sec, onSeek, to, label, className = "",
}: {
  sec: number | null | undefined;
  onSeek?: (sec: number) => void;
  to?: string;
  /** Extra words for the accessible name, e.g. the link label. */
  label?: string;
  className?: string;
}) {
  if (sec === null || sec === undefined) return null;
  const ts = formatTimestamp(sec);
  const aria = `Play from ${ts}${label ? `, ${label}` : ""}`;
  const cls = `locator ${className}`;
  if (to) return <Link to={to} className={cls} aria-label={aria} title={aria}>{ts}</Link>;
  if (onSeek) {
    return (
      <button type="button" className={cls} aria-label={aria} title={aria} onClick={(e) => { e.stopPropagation(); onSeek(sec); }}>
        {ts}
      </button>
    );
  }
  return <span className={cls}>{ts}</span>;
}
