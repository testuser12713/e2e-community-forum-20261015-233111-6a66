import type { KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatCount, formatRelativeTime } from "../lib/format";
import type { ThreadSummary, VoteOut } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { VoteButtons } from "./VoteButtons";

export interface ThreadCardProps {
  thread: ThreadSummary;
  /** Called with the server's answer after a successful vote on the thread. */
  onVote?: (out: VoteOut) => void;
  onTagClick?: (tag: string) => void;
}

/**
 * A single row in a thread list (DESIGN.md §ThreadListItem): vote column,
 * title with pinned/locked/removed badges, the category · author · time ·
 * comment-count meta line and clickable tag chips.
 *
 * The vote column carries the shared VoteControl permanently — never a bare
 * score and never a hover reveal. The control performs its own request through
 * VoteButtons, so it is live wherever a ThreadCard is rendered; where it cannot
 * act (banned users, one's own thread) it is rendered visibly disabled with the
 * reason as a tooltip, per AC-43.
 */
export function ThreadCard({ thread, onVote, onTagClick }: ThreadCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const threadPath = `/t/${thread.id}`;

  const isOwnThread = user != null && thread.author.id === user.id;
  const isBanned = user?.is_banned === true;
  const voteDisabled = isBanned || isOwnThread;
  const voteDisabledReason = isBanned
    ? `Gesperrt: ${user?.ban_reason ?? "Ohne Grund"}`
    : isOwnThread
      ? "Eigene Inhalte können nicht bewertet werden."
      : undefined;

  function openThread() {
    navigate(threadPath);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    // Only the row itself opens the thread — a key press on the nested vote
    // arrows must not also navigate away.
    if (event.key === "Enter" && event.target === event.currentTarget) {
      event.preventDefault();
      openThread();
    }
  }

  return (
    <li
      role="link"
      tabIndex={0}
      aria-label={thread.title}
      onClick={openThread}
      onKeyDown={handleKeyDown}
      className={
        "flex cursor-pointer gap-3 border-b border-border p-4 last:border-b-0 " +
        (thread.is_pinned ? "bg-accent-soft" : "hover:bg-bg-subtle")
      }
    >
      <div className="w-10 shrink-0" onClick={(event) => event.stopPropagation()}>
        <VoteButtons
          targetType="thread"
          targetId={thread.id}
          score={thread.score}
          value={0}
          onVote={onVote}
          disabled={voteDisabled}
          disabledReason={voteDisabledReason}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {thread.is_pinned && <span className="badge badge-accent">Angepinnt</span>}
          {thread.is_locked && <span className="badge badge-warning">Gesperrt</span>}
          {thread.is_deleted && <span className="badge badge-danger">Entfernt</span>}
          <h2 className="min-w-0 text-[17px] font-semibold leading-snug">
            <Link
              to={threadPath}
              onClick={(event) => event.stopPropagation()}
              className="line-clamp-2 hover:text-accent hover:underline"
            >
              {thread.title}
            </Link>
          </h2>
        </div>

        <p className="text-[13px] text-fg-muted">
          <Link
            to={`/c/${thread.category.slug}`}
            onClick={(event) => event.stopPropagation()}
            className="hover:text-accent hover:underline"
          >
            {thread.category.name}
          </Link>
          {" · "}
          <Link
            to={`/u/${thread.author.username}`}
            onClick={(event) => event.stopPropagation()}
            className="hover:text-accent hover:underline"
          >
            {thread.author.display_name || thread.author.username}
          </Link>
          {" · "}
          <time dateTime={thread.created_at}>
            {formatRelativeTime(thread.created_at)}
          </time>
          {" · "}
          <span>Kommentare: {formatCount(thread.comment_count)}</span>
        </p>

        {thread.tags.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1">
            {thread.tags.map((tag) =>
              onTagClick ? (
                <li key={tag}>
                  <button
                    type="button"
                    className="badge hover:border-accent hover:text-accent"
                    onClick={(event) => {
                      event.stopPropagation();
                      onTagClick(tag);
                    }}
                  >
                    #{tag}
                  </button>
                </li>
              ) : (
                <li key={tag} className="badge">
                  #{tag}
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </li>
  );
}

export default ThreadCard;
