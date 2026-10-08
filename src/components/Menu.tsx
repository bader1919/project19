import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  danger?: boolean;
  /** When defined the item is a radio-style choice (aria-checked) and shows a check. */
  checked?: boolean;
  disabled?: boolean;
}

/**
 * Small popover menu (role="menu").
 * Keys: Enter/Space/ArrowDown on the trigger opens; Arrow keys/Home/End move; Esc closes and refocuses the trigger; Tab closes.
 * Choosing an item closes the menu, returns focus to the trigger, then runs `onSelect`
 * (so a dialog opened by the item restores focus to a live element).
 * Defaults to an icon-button trigger; for a text trigger pass `triggerClassName="btn-outline btn-sm"`.
 */
export function Menu({
  label, trigger, items, align = "start", triggerClassName = "icon-btn", className = "",
}: {
  /** Accessible name of the trigger. */
  label: string;
  trigger: ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  triggerClassName?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const list = wrap.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    const checked = wrap.current?.querySelector<HTMLElement>('[aria-checked="true"]');
    (checked ?? list?.[0])?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const els = Array.from(wrap.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "ArrowDown") { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); els[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); els[els.length - 1]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === "Tab") close(false);
  };

  return (
    <div ref={wrap} className={`relative inline-block ${className}`}>
      <button
        ref={btn}
        type="button"
        className={triggerClassName}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); }
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={`popover absolute z-40 mt-1 max-h-[60dvh] min-w-[200px] max-w-[calc(100vw-32px)] animate-fade-in overflow-y-auto p-1 ${align === "end" ? "end-0" : "start-0"}`}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role={it.checked === undefined ? "menuitem" : "menuitemradio"}
              aria-checked={it.checked}
              disabled={it.disabled}
              tabIndex={-1}
              onClick={() => {
                close(true);
                it.onSelect();
              }}
              className={`flex min-h-[44px] w-full items-center gap-2 rounded-ctl px-3 text-start text-body hover:bg-binding-wash focus:bg-binding-wash disabled:opacity-50 sm:min-h-[36px] ${it.danger ? "text-danger" : "text-ink"} ${it.checked ? "font-medium" : ""}`}
            >
              {it.icon}
              <span className="min-w-0 flex-1 truncate" dir="auto">{it.label}</span>
              {it.checked && <Check aria-hidden="true" className="h-4 w-4 text-binding" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
