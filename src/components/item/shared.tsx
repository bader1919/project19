import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { IconButton } from "../IconButton";

/** Stored JSON is written by AI tools and other clients: never trust its shape when rendering. */
export function asArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export type SeekFn = (sec: number) => void;

export { focusIfLost } from "../../lib/focus";

/** Icon button that copies text and shows a check for a moment. */
export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");
  return (
    <IconButton
      label={state === "done" ? "Copied" : state === "failed" ? "Couldn't copy. Select the text and copy it by hand." : label}
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("done");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 1800);
      }}
    >
      {state === "done" ? <Check className="h-4 w-4 text-binding" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
    </IconButton>
  );
}

/**
 * One section of the continuous item page: serif h2, hairline above (except the first), anchor target for the contents bar.
 * `id` must match an entry in the contents bar.
 */
export function Block({
  id, title, action, first = false, children,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} data-block className={`scroll-mt-32 ${first ? "pt-6" : "mt-10 border-t border-line pt-8"}`}>
      <div className="mb-4 flex min-h-[44px] items-center justify-between gap-3 sm:min-h-[32px]">
        <h2 id={`${id}-h`} tabIndex={-1} className="text-h2 outline-none">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
