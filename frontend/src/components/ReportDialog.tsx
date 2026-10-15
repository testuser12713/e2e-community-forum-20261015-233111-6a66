import { useEffect, useRef, useState } from "react";
import * as reportsApi from "../api/reports";
import { ApiError } from "../api/client";
import type { ReportContentType } from "../api/types";

export interface ReportDialogProps {
  open: boolean;
  content_type: ReportContentType;
  content_id: number;
  onClose: () => void;
}

/** The four reasons of DESIGN.md §ReportFlow. */
const REASONS = ["Spam", "Beleidigung", "Spam-Link", "Sonstiges"] as const;
const NOTE_MAX = 500;

/**
 * Report flow dialog (AC-24). Collects a reason and an optional note and posts
 * them to POST /api/v1/reports. A duplicate open report (409) is rendered as a
 * form-level alert and leaves the dialog open (DESIGN.md §ReportFlow).
 */
export function ReportDialog({
  open,
  content_type,
  content_id,
  onClose,
}: ReportDialogProps) {
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState<{ reason: boolean; note: boolean }>({
    reason: false,
    note: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setNote("");
    setTouched({ reason: false, note: false });
    setSubmitted(false);
    setPending(false);
    setSuccess(false);
    setFormError(null);
  }, [open, content_id, content_type]);

  useEffect(() => {
    if (!open) return;
    const node = panelRef.current?.querySelector<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    node?.focus();
  }, [open, success]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
      if (event.key === "Tab" && panelRef.current) {
        const focusables = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            "button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
          ),
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const showReasonError = (touched.reason || submitted) && reason === "";
  const showNoteError = (touched.note || submitted) && note.length > NOTE_MAX;

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitted(true);
    if (reason === "" || note.length > NOTE_MAX) return;

    setPending(true);
    setFormError(null);
    try {
      await reportsApi.createReport({
        content_type,
        content_id,
        reason,
        note: note.trim() === "" ? null : note.trim(),
      });
      setSuccess(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setFormError("Du hast diesen Inhalt bereits gemeldet.");
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Meldung fehlgeschlagen. Bitte später erneut versuchen.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      style={{ background: "var(--color-overlay)" }}
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        className="card card-raised w-full p-6"
        style={{
          borderRadius: "var(--radius-lg)",
          maxWidth: "min(480px, calc(100vw - 32px))",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="report-dialog-title" className="text-[20px] font-semibold">
          Inhalt melden
        </h2>

        {success ? (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-[16px] font-semibold">
              Danke, die Meldung liegt in der Warteschlange
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                className="btn btn-primary"
                onClick={onClose}
              >
                Schließen
              </button>
            </div>
          </div>
        ) : (
          <form className="mt-4 flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
            {formError ? (
              <p
                role="alert"
                className="rounded-md border px-4 py-3 text-[14px]"
                style={{
                  background: "var(--color-danger-soft)",
                  borderColor: "var(--color-danger)",
                }}
              >
                {formError}
              </p>
            ) : null}

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-[14px] font-medium">Grund</legend>
              {REASONS.map((option) => (
                <label
                  key={option}
                  className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border px-3"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={option}
                    checked={reason === option}
                    onChange={() => {
                      setReason(option);
                      setTouched((prev) => ({ ...prev, reason: true }));
                    }}
                  />
                  {option}
                </label>
              ))}
              {showReasonError ? (
                <p role="alert" className="text-[13px]" style={{ color: "var(--color-danger)" }}>
                  Bitte wähle einen Grund.
                </p>
              ) : null}
            </fieldset>

            <div className="flex flex-col gap-1">
              <label htmlFor="report-note" className="text-[14px] font-medium">
                Notiz (optional)
              </label>
              <textarea
                id="report-note"
                className="input"
                style={{ minHeight: 120 }}
                maxLength={NOTE_MAX + 1}
                value={note}
                onBlur={() => setTouched((prev) => ({ ...prev, note: true }))}
                onChange={(event) => setNote(event.target.value)}
              />
              {showNoteError ? (
                <p role="alert" className="text-[13px]" style={{ color: "var(--color-danger)" }}>
                  Maximal {NOTE_MAX} Zeichen.
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Abbrechen
              </button>
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "Wird gesendet…" : "Meldung senden"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ReportDialog;
