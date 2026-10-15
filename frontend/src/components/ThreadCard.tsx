import type { KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatCount, formatRelativeTime, formatScore } from "../lib/format";
import type { ThreadSummary } from "../api/types";

export interface ThreadCardProps {
  thread: ThreadSummary;
  onVote?: (value: 1 | -1 | 0) => void;
  onTagClick?: (tag: string) => void;
}

function UpArrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5l7 8h-4v6h-6v-6H5z" fill="currentColor" />
    </svg>
  );
}

function DownArrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 19l-7-8h4V5h6v6h4z" fill="currentColor" />
    </svg>
  );
}

/**
 * A single row in a thread list (DESIGN.md §ThreadListItem): vote column,
 * title with pinned/locked/removed badges, the category · author · time ·
 * comment-count meta line and clickable tag chips.
 */
export function ThreadCard({ thread, onVote, onTagClick }: ThreadCardProps) {
  const navigate = useNavigate();
  const threadPath = `/t/${thread.id}`;
  const votable = typeof onVote === "function";

  function openThread() {
    navigate(threadPath);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (event.key === "Enter") {
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
      <div className="flex w-10 shrink-0 flex-col items-center gap-0.5">
        {votable && (
          <button
            type="button"
            className="icon-btn h-8 w-8 p-0"
            aria-label="Hochstimmen"
            onClick={(event) => {
              event.stopPropagation();
              onVote?.(1);
            }}
          >
            <UpArrow />
          </button>
        )}
        <span
          className="text-[15px] font-semibold tabular-nums"
          title="Punktzahl"
          aria-label={`Punktzahl ${formatScore(thread.score)}`}
        >
          {formatScore(thread.score)}
        </span>
        {votable && (
          <button
            type="button"
            className="icon-btn h-8 w-8 p-0"
            aria-label="Herunterstimmen"
            onClick={(event) => {
              event.stopPropagation();
              onVote?.(-1);
            }}
          >
            <DownArrow />
          </button>
        )}
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
