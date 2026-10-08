import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type SheetPlacement = "auto" | "center" | "full";

/**
 * Modal surface. Render it only while open (`{open && <Sheet ...>}`).
 * - placement "auto" (default): bottom sheet below `sm`, centred 440px dialog from `sm`.
 * - "center": centred dialog at every size (used by ConfirmDialog).
 * - "full": full screen below `sm`, top-anchored 560px dialog from `sm` (search overlay).
 * Behaviour: portal, backdrop click and Esc call `onClose` (unless `dismissible` is false), Tab is trapped,
 * focus starts on `[data-autofocus]` (else the first control) and returns to the opener on close, page scroll is locked.
 */
export function Sheet({
  title, onClose, children, placement = "auto", dismissible = true, role = "dialog", hideTitle = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  placement?: SheetPlacement;
  dismissible?: boolean;
  role?: "dialog" | "alertdialog";
  /** Keep the title for screen readers only. */
  hideTitle?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const target =
      el.querySelector<HTMLElement>("[data-autofocus]") ??
      Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).find((n) => !n.hasAttribute("data-sheet-close")) ??
      el;
    if (!el.contains(document.activeElement) || target.hasAttribute("data-autofocus")) target.focus();

    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === "Tab") {
        const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
        if (items.length === 0) return e.preventDefault();
        const first = items[0];
        const last = items[items.length - 1];
        if (!el.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      root.style.overflow = prevOverflow;
      if (opener && opener.isConnected) opener.focus();
    };
  }, [dismissible, opener]);

  const wrap =
    placement === "center" ? "items-center justify-center p-4"
    : placement === "full" ? "items-stretch justify-center sm:items-start sm:p-4 sm:pt-[12vh]"
    : "items-end justify-center sm:items-center sm:p-4";
  const box =
    placement === "center" ? "max-w-[440px] rounded-frame"
    : placement === "full" ? "h-dvh sm:h-auto sm:max-w-[560px] sm:rounded-frame"
    : "max-w-none rounded-t-frame sm:max-w-[440px] sm:rounded-frame";
  const anim = placement === "auto" ? "animate-sheet-up sm:animate-fade-in" : "animate-fade-in";

  return createPortal(
    <div className={`fixed inset-0 z-50 flex ${wrap}`}>
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={dismissible ? onClose : undefined} aria-hidden="true" />
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`popover relative flex max-h-[90dvh] w-full flex-col overflow-hidden border-line ${box} ${anim} ${placement === "full" ? "max-h-none sm:max-h-[80dvh]" : ""}`}
      >
        <div className={`flex items-center justify-between gap-3 ps-5 pe-2 pt-3 ${hideTitle ? "" : "pb-1"}`}>
          <h2 id={titleId} className={hideTitle ? "sr-only" : "text-h2"} dir="auto">{title}</h2>
          {dismissible && (
            <IconButton label="Close" onClick={onClose} data-sheet-close className="ms-auto">
              <X className="h-5 w-5" aria-hidden="true" />
            </IconButton>
          )}
        </div>
        <div className="overflow-y-auto px-5 pb-5 pt-2 [padding-bottom:max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
