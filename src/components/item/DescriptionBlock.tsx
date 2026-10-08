import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Block } from "./shared";

function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!/^https?:\/\//.test(p)) return <span key={i}>{p}</span>;
        // Punctuation right after a URL ("…/page.", "ollama.com،") belongs to the sentence.
        const url = p.replace(/[.,;:!?'"»)\]}>،؛؟…]+$/, "");
        return (
          <span key={i}>
            <a href={url} target="_blank" rel="noreferrer" className="break-all text-binding hover:underline">{url}</a>
            {p.slice(url.length)}
          </span>
        );
      })}
    </>
  );
}

/** The video's own description text, collapsed to a few lines until asked for. */
export function DescriptionBlock({ description }: { description: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!description?.trim()) return null;
  return (
    <Block id="description" title="Description">
      <p dir="auto" id="description-text" className={`max-w-prose whitespace-pre-line break-words text-body ${open ? "" : "line-clamp-4"}`}>
        <Linkified text={description} />
      </p>
      <button type="button" className="btn-ghost btn-sm -ms-3 mt-2" aria-expanded={open} aria-controls="description-text" onClick={() => setOpen((o) => !o)}>
        <ChevronDown className={`h-4 w-4 transition-transform duration-100 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        {open ? "Hide full description" : "Show full description"}
      </button>
    </Block>
  );
}
