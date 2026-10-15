import { useEffect, useState } from "react";
import { banUser } from "../api/admin";
import { ApiError } from "../api/client";
import type { AdminUserOut } from "../api/types";

interface BanDialogProps {
  open: boolean;
  user: AdminUserOut | null;
  onClose: () => void;
  onBanned?: (user: AdminUserOut) => void;
}

export default function BanDialog({
  open,
  user,
  onClose,
  onBanned,
}: BanDialogProps) {
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setExpiresAt("");
      setSubmitted(false);
      setPending(false);
      setError(null);
    }
  }, [open, user?.id]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !user) {
    return null;
  }

  const reasonMissing = submitted && reason.trim().length === 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    if (reason.trim().length === 0) {
      return;
    }
    setPending(true);
    try {
      const result = await banUser(user!.id, {
        reason: reason.trim(),
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      onBanned?.(result);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Sperren fehlgeschlagen.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ban-dialog-title"
        className="w-full max-w-[min(480px,calc(100vw-32px))] rounded-lg border border-border bg-surface-raised p-6 shadow-lg"
      >
        <h2 id="ban-dialog-title" className="text-xl font-semibold text-fg">
          {user.display_name || user.username} sperren
        </h2>
        <form className="mt-4 flex flex-col gap-4" onSubmit={submit} noValidate>
          <label className="flex flex-col gap-1 text-sm font-medium text-fg">
            Grund
            <input
              type="text"
              value={reason}
              autoFocus
              onChange={(event) => setReason(event.target.value)}
              className="h-11 rounded-md border border-border bg-surface px-3 text-[15px] text-fg"
            />
            {reasonMissing && (
              <span role="alert" className="text-[13px] text-danger">
                Bitte einen Grund angeben.
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-fg">
            Sperre bis (optional)
            <input
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              className="h-11 rounded-md border border-border bg-surface px-3 text-[15px] text-fg"
            />
          </label>
          {error && (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center rounded-md border border-border bg-surface px-4 text-sm font-semibold text-fg hover:bg-bg-subtle"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-11 items-center rounded-md bg-danger px-4 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Sperren…" : "Sperren"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
