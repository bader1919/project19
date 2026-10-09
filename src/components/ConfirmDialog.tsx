import { useState } from "react";
import { Sheet } from "./Sheet";

/**
 * Replacement for window.confirm. Name the entity in `title` ("Delete “Postgres talk”?").
 * Cancel has the initial focus; Esc and backdrop cancel. `onConfirm` may be async: buttons disable while it runs,
 * the dialog closes (via `onClose`) when it resolves, and a thrown error is shown inside the dialog.
 * Render only while open: `{target && <ConfirmDialog .../>}`.
 */
export function ConfirmDialog({
  title, body, confirmLabel, cancelLabel = "Cancel", danger = false, onConfirm, onClose,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Sheet title={title} onClose={onClose} placement="center" role="alertdialog" dismissible={!busy}>
      {body && <p className="text-body text-ink-2">{body}</p>}
      {error && <p role="alert" className="mt-3 border-s-4 border-danger bg-danger/10 px-3 py-2 text-meta">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-outline" onClick={onClose} disabled={busy} data-autofocus>{cancelLabel}</button>
        <button type="button" className={danger ? "btn-danger-solid" : "btn-primary"} onClick={run} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
