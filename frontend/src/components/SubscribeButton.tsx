import { useEffect, useState } from "react";
import * as subscriptionsApi from "../api/subscriptions";

export interface SubscribeButtonProps {
  /** When set, the component reads and switches its own subscription state. */
  threadId?: number;
  /** Controlled display state (used together with `onToggle`). */
  subscribed?: boolean;
  /** Controlled toggle handler; when present the parent owns the state. */
  onToggle?: () => void;
  disabled?: boolean;
}

/**
 * Thread subscription toggle (AC-21).
 *
 * With a `threadId` it reads the current state from
 * GET /api/v1/threads/{id}/subscription and switches it with POST / DELETE,
 * reading the `subscribed` field of the same response shape. Otherwise it
 * behaves as a controlled control driven by `subscribed` + `onToggle`.
 */
export function SubscribeButton({
  threadId,
  subscribed,
  onToggle,
  disabled = false,
}: SubscribeButtonProps) {
  const [isSubscribed, setIsSubscribed] = useState<boolean>(subscribed ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (subscribed !== undefined) setIsSubscribed(subscribed);
  }, [subscribed]);

  useEffect(() => {
    if (threadId === undefined) return;
    let cancelled = false;
    subscriptionsApi
      .getSubscription(threadId)
      .then((state) => {
        if (!cancelled) setIsSubscribed(state.subscribed);
      })
      .catch(() => {
        /* leave the current state; the toggle still works */
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  const interactive = threadId !== undefined || onToggle !== undefined;
  const isDisabled = disabled || pending || !interactive;
  const label = isSubscribed ? "Abonniert" : "Abonnieren";

  async function handleClick(): Promise<void> {
    if (isDisabled) return;
    const next = !isSubscribed;

    if (onToggle) {
      onToggle();
      setIsSubscribed(next);
      return;
    }
    if (threadId === undefined) return;

    setPending(true);
    setError(null);
    try {
      if (next) await subscriptionsApi.subscribe(threadId);
      else await subscriptionsApi.unsubscribe(threadId);
      setIsSubscribed(next);
    } catch {
      setError("Abonnieren fehlgeschlagen. Bitte später erneut versuchen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 items-start">
      <button
        type="button"
        className={`btn ${isSubscribed ? "btn-secondary" : "btn-primary"}`}
        aria-pressed={isSubscribed}
        disabled={isDisabled}
        onClick={() => void handleClick()}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill={isSubscribed ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {label}
      </button>
      {error ? (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default SubscribeButton;
