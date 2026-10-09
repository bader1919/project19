import { useId } from "react";
import { Search } from "lucide-react";

/** Search-as-you-type field. The label is read aloud and the placeholder is only a format hint. Esc clears. */
export function SearchField({
  label, placeholder, value, onChange, className = "",
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-2" />
      <input
        id={id}
        type="search"
        dir="auto"
        className="input ps-9"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape" && value) { e.preventDefault(); onChange(""); } }}
      />
    </div>
  );
}
