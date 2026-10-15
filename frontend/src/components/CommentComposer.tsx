import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../api/client";

export interface CommentComposerProps {
  /**
   * Submit handler. It may reject with an `ApiError`; the composer then reads
   * the shared error envelope and renders the matching hint (429 = rate limit,
   * 400 = maximum depth named by the server, 403 = locked thread reason).
   */
  onSubmit?: (body: string) => void | Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
  submitting?: boolean;
  /** Visible label above the textarea, e.g. "Antwort an @alice". */
  label?: string;
  placeholder?: string;
  /** Pre-filled body for the edit form. */
  initialValue?: string;
  /** Label of the submit button. */
  submitLabel?: string;
  /** Rendered when the user cancels an edit or reply form. */
  onCancel?: () => void;
  autoFocus?: boolean;
}

const DEFAULT_RETRY_SECONDS = 60;

/** The rate-limit window from the 429 envelope, or a sane default. */
function retryAfterSeconds(error: ApiError): number {
  const details = error.details;
  if (details && !Array.isArray(details)) {
    const raw = (details as Record<string, unknown>).retry_after;
    const value = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(value) && value > 0) return Math.ceil(value);
  }
  return DEFAULT_RETRY_SECONDS;
}

/**
 * Comment input (DESIGN.md §MarkdownEditor rate-limit state).
 *
 * The composer is neutral until the field was touched or the form was
 * submitted (AC-44). It turns the shared error envelope into user feedback:
 * a 429 blocks submitting and shows a live countdown (AC-25), a 400 (maximum
 * depth) and a 403 (locked thread) render the envelope's own message.
 */
export function CommentComposer({
  onSubmit,
  disabled = false,
  disabledReason,
  submitting = false,
  label,
  placeholder,
  initialValue,
  submitLabel,
  onCancel,
  autoFocus = false,
}: CommentComposerProps) {
  const [body, setBody] = useState(initialValue ?? "");
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setBody(initialValue ?? "");
    setTouched(false);
    setSubmitted(false);
    setFormError(null);
  }, [initialValue]);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (blockedUntil === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [blockedUntil]);

  const remaining =
    blockedUntil === null
      ? 0
      : Math.max(0, Math.ceil((blockedUntil - now) / 1000));
  const blocked = blockedUntil !== null && remaining > 0;

  useEffect(() => {
    if (blockedUntil !== null && remaining <= 0) setBlockedUntil(null);
  }, [blockedUntil, remaining]);

  const empty = body.trim() === "";
  const showEmptyError = (touched || submitted) && empty;
  const busy = pending || submitting;
  const submitDisabled = disabled || busy || blocked || onSubmit === undefined;

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitted(true);
    if (submitDisabled) return;
    if (empty) return;

    setPending(true);
    setFormError(null);
    try {
      await onSubmit?.(body.trim());
      setBody("");
      setTouched(false);
      setSubmitted(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setBlockedUntil(Date.now() + retryAfterSeconds(err) * 1000);
        setFormError(null);
      } else if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Der Kommentar konnte nicht gespeichert werden.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => void handleSubmit(event)}
      noValidate
    >
      {label ? (
        <label
          htmlFor={fieldId}
          className="text-[14px] font-medium text-fg"
        >
          {label}
        </label>
      ) : null}

      <textarea
        id={fieldId}
        ref={textareaRef}
        className="input"
        style={{ minHeight: 120, resize: "vertical" }}
        aria-label={label ? undefined : "Kommentar"}
        aria-invalid={showEmptyError || undefined}
        aria-describedby={showEmptyError ? errorId : undefined}
        placeholder={placeholder}
        value={body}
        disabled={disabled || busy}
        onBlur={() => setTouched(true)}
        onChange={(event) => setBody(event.target.value)}
      />

      {showEmptyError ? (
        <p
          id={errorId}
          role="alert"
          className="text-[13px] leading-[18px] text-danger"
        >
          Bitte gib einen Kommentar ein.
        </p>
      ) : null}

      {formError ? (
        <p role="alert" className="text-[13px] leading-[18px] text-danger">
          {formError}
        </p>
      ) : null}

      {blocked ? (
        <p
          role="alert"
          className="text-[13px] leading-[18px]"
          style={{ color: "var(--color-warning)" }}
        >
          Zu viele Beiträge – erneut in {remaining} s
        </p>
      ) : null}

      {disabled && disabledReason ? (
        <p role="status" className="text-[13px] leading-[18px] text-fg-muted">
          {disabledReason}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Abbrechen
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={submitDisabled}>
          {busy ? "Wird gesendet…" : (submitLabel ?? "Kommentar senden")}
        </button>
      </div>
    </form>
  );
}

export default CommentComposer;
