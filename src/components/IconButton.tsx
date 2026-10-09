import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/** Square icon-only button: 44px on touch, 32px on desktop. `label` becomes aria-label and the native tooltip. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title"> & { label: string; children: ReactNode; shortcut?: string }
>(function IconButton({ label, children, className = "", shortcut, type = "button", ...rest }, ref) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button ref={ref} type={type} aria-label={label} title={title} className={`icon-btn ${className}`} {...rest}>
      {children}
    </button>
  );
});
