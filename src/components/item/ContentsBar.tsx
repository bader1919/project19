import { useEffect, useRef, useState } from "react";

export interface ContentsEntry { id: string; label: string; count?: number }

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

/** Smooth scroll that honours reduced motion. */
export function scrollToEl(el: Element, block: ScrollLogicalPosition = "start") {
  el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block });
}

/** Which section is under the contents bar. Observes with IntersectionObserver; `skip` ids are never highlighted. */
function useActiveSection(ids: string[], skip: string[]) {
  const [active, setActive] = useState(ids[0] ?? "");
  const key = ids.join("|");
  useEffect(() => {
    const visible = new Set<string>();
    const els = ids.filter((id) => !skip.includes(id)).map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    const pick = () => {
      const last = ids.filter((id) => visible.has(id)).pop();
      if (last) setActive(last);
    };
    // The band starts under the sticky chrome and ends before the lower half of the viewport.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id);
        pick();
      },
      { rootMargin: "-130px 0px -55% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, skip.join("|")]);
  return [active, setActive] as const;
}

/**
 * Sticky in-page contents: anchor links to each section, the one in view is marked.
 * On desktop `notes` lives in the always-visible rail, so it is not tracked, and choosing it moves focus to the note.
 */
export function ContentsBar({ entries, className = "" }: { entries: ContentsEntry[]; className?: string }) {
  const ids = entries.map((e) => e.id);
  const [active, setActive] = useActiveSection(ids, ["notes"]);
  const scroller = useRef<HTMLUListElement>(null);

  // Keep the active link visible in the horizontally scrolling bar (mobile).
  useEffect(() => {
    const a = scroller.current?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!a || !scroller.current) return;
    const box = scroller.current;
    const left = a.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft || left + a.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left: left - 16, behavior: reduced() ? "auto" : "smooth" });
  }, [active]);

  const go = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    if (id === "notes" && isDesktop()) {
      el.querySelector<HTMLElement>("textarea, button")?.focus();
      return;
    }
    scrollToEl(el);
    // Move focus to the heading so keyboard and screen reader users land in the section.
    el.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  };

  return (
    <nav aria-label="On this page" className={`sticky top-12 z-10 -mx-4 border-b border-line bg-paper px-4 sm:-mx-8 sm:px-8 lg:top-14 lg:mx-0 lg:px-0 ${className}`}>
      <ul ref={scroller} className="flex gap-1 lg:-ms-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {entries.map((e) => {
          const on = e.id === active && !(e.id === "notes" && isDesktop());
          return (
            <li key={e.id} className="shrink-0">
              <a
                href={`#${e.id}`}
                onClick={(ev) => go(ev, e.id)}
                aria-current={on ? "location" : undefined}
                className={`-mb-px flex min-h-[44px] items-center border-b-2 px-3 text-body transition-colors duration-100 ${
                  on ? "border-binding font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"
                }`}
              >
                {e.label}
                {e.count !== undefined && <span className="num ms-1.5 text-small text-ink-2">{e.count}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
