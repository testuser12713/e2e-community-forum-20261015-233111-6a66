import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { voteComment, voteThread } from "../api/votes";
import type { VoteOut, VoteValue } from "../api/types";

export interface VoteButtonsProps {
  /** Whether the vote targets a thread or a comment. */
  targetType: "thread" | "comment";
  /** Id of the thread or comment that is voted on. */
  targetId: number;
  /** Score as the server last reported it. */
  score: number;
  /** The signed-in user's own vote on this item (1, -1 or 0). */
  value: VoteValue;
  /** Called with the server's answer after a successful vote. */
  onVote?: (out: VoteOut) => void;
  /** Own content or a banned user: arrows disabled, reason as the tooltip. */
  disabled?: boolean;
  disabledReason?: string;
}

const MINUS = "\u2212";

/** DESIGN.md formatting contract: signed integer, tabular, U+2212 for minus. */
export function formatScore(score: number): string {
  if (score > 0) return `+${score}`;
  if (score < 0) return `${MINUS}${Math.abs(score)}`;
  return "0";
}

function UpIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 6l6 11H6z" />
    </svg>
  );
}

function DownIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 18l-6-11h12z" />
    </svg>
  );
}

function arrowClass(active: boolean, tone: "up" | "down"): string {
  const base =
    "flex h-11 w-11 items-center justify-center rounded-md border-none bg-transparent p-0 " +
    "transition-colors duration-[120ms] md:h-8 md:w-8 disabled:cursor-not-allowed disabled:opacity-40";
  if (active) {
    return `${base} ${
      tone === "up"
        ? "bg-accent text-accent-contrast"
        : "bg-downvote text-white"
    }`;
  }
  return `${base} text-fg-muted hover:bg-bg-subtle hover:text-fg disabled:hover:bg-transparent`;
}

/**
 * Vertical vote control (DESIGN.md §VoteControl). It owns the request to
 * POST /api/v1/threads/{id}/vote or /api/v1/comments/{id}/vote and reflects the
 * score and the user's vote returned in the same response, without a reload.
 * A second click on the same direction removes the vote (the server toggles the
 * absolute value). A 400 on one's own content shows the shared error envelope's
 * message and leaves the score unchanged; an anonymous caller (401) is sent to
 * the login page instead of silently doing nothing.
 */
export function VoteButtons({
  targetType,
  targetId,
  score,
  value,
  onVote,
  disabled = false,
  disabledReason,
}: VoteButtonsProps) {
  const navigate = useNavigate();
  const [currentScore, setCurrentScore] = useState(score);
  const [currentValue, setCurrentValue] = useState<VoteValue>(value);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrentScore(score);
    setCurrentValue(value);
  }, [score, value]);

  const castVote = async (direction: 1 | -1) => {
    if (pending || disabled) return;
    setPending(true);
    setError(null);
    try {
      const out =
        targetType === "thread"
          ? await voteThread(targetId, direction)
          : await voteComment(targetId, direction);
      setCurrentScore(out.score);
      setCurrentValue(out.my_vote);
      onVote?.(out);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/login");
        return;
      }
      setError(
        err instanceof ApiError
          ? err.message
          : "Die Stimme konnte nicht gespeichert werden.",
      );
    } finally {
      setPending(false);
    }
  };

  const scoreTone =
    currentValue === 1
      ? "text-accent"
      : currentValue === -1
        ? "text-downvote"
        : "text-fg";

  return (
    <div className="flex flex-col items-center">
      <div
        className="flex w-10 flex-col items-center"
        data-vote-target={targetType}
        aria-busy={pending}
      >
        <button
          type="button"
          className={arrowClass(currentValue === 1, "up")}
          onClick={() => void castVote(1)}
          disabled={disabled || pending}
          aria-label="Hochstimmen"
          aria-pressed={currentValue === 1}
          title={disabledReason}
        >
          <UpIcon filled={currentValue === 1} />
        </button>
        <span
          className={`h-5 text-[15px] font-semibold leading-5 tabular-nums ${scoreTone}`}
          aria-label={`Punktzahl: ${currentScore}`}
        >
          {formatScore(currentScore)}
        </span>
        <button
          type="button"
          className={arrowClass(currentValue === -1, "down")}
          onClick={() => void castVote(-1)}
          disabled={disabled || pending}
          aria-label="Runterstimmen"
          aria-pressed={currentValue === -1}
          title={disabledReason}
        >
          <DownIcon filled={currentValue === -1} />
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="mt-1 max-w-[14rem] text-center text-[13px] leading-[18px] text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export default VoteButtons;
