import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { getThread } from "../api/threads";
import { createComment, listComments } from "../api/comments";
import { useAuth } from "../context/AuthContext";
import { formatCount, formatRelativeTime, formatScore } from "../lib/format";
import { MarkdownView } from "../components/MarkdownView";
import { BannedNotice } from "../components/BannedNotice";
import { VoteButtons } from "../components/VoteButtons";
import { CommentTree } from "../components/CommentTree";
import { CommentComposer } from "../components/CommentComposer";
import { SubscribeButton } from "../components/SubscribeButton";
import { ModerationMenu } from "../components/ModerationMenu";

interface BanInfo {
  reason: string | null;
  expiresAt: string | null;
}

/**
 * Pulls the ban reason and expiry out of a 403 error envelope's `details`.
 *
 * The contract says the ban reason and expiry travel inside `details`; the
 * live skeleton names the same values `ban_reason` / `ban_expires_at` on the
 * user shapes, so both spellings are accepted here. A 403 without a reason is
 * NOT treated as a ban (a role-based 403 must not raise the ban banner).
 */
export function extractBanInfo(details: unknown): BanInfo | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  const record = details as Record<string, unknown>;
  const reasonRaw = record.ban_reason ?? record.reason;
  const expiryRaw = record.ban_expires_at ?? record.expires_at;
  const reason = typeof reasonRaw === "string" ? reasonRaw : null;
  const expiresAt = typeof expiryRaw === "string" ? expiryRaw : null;
  if (!reason && !expiresAt) return null;
  return { reason, expiresAt };
}

/** Classifies an error as a ban only when it is a 403 carrying a reason. */
function banFromError(err: unknown): BanInfo | null {
  if (!(err instanceof ApiError) || err.status !== 403) return null;
  const info = extractBanInfo(err.details);
  if (info && info.reason) return info;
  return null;
}

function LoadingSkeleton() {
  return (
    <div className="card" role="status" aria-label="Thread wird geladen">
      <div className="h-6 w-2/3 animate-pulse rounded bg-bg-subtle" />
      <div className="mt-4 h-4 w-1/3 animate-pulse rounded bg-bg-subtle" />
      <div className="mt-6 h-4 w-full animate-pulse rounded bg-bg-subtle" />
      <div className="mt-3 h-4 w-5/6 animate-pulse rounded bg-bg-subtle" />
    </div>
  );
}

function NotFound() {
  return (
    <section className="card empty-state" role="status">
      <p className="empty-state__title">Thread nicht gefunden</p>
      <p className="empty-state__hint">
        Dieser Thread existiert nicht oder wurde entfernt.
      </p>
      <Link to="/" className="btn btn-secondary">
        Zur Startseite
      </Link>
    </section>
  );
}

/**
 * The thread detail page (AC-10, AC-12, AC-26).
 *
 * Reads one thread from GET /api/v1/threads/{id} and renders its sanitised
 * body through MarkdownView, the edited and deleted markers, the lock badge,
 * and the slots for votes, comments, subscription and moderation that the
 * sibling tickets fill. A 403 ban notice disables every write control.
 */
export function ThreadPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();

  const parsedId = Number(params.id);
  const validId = Number.isInteger(parsedId) && parsedId > 0;

  const [ban, setBan] = useState<BanInfo | null>(null);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const threadQuery = useQuery({
    queryKey: ["thread", parsedId],
    queryFn: () => getThread(parsedId),
    enabled: validId,
    retry: false,
  });

  const commentsQuery = useQuery({
    queryKey: ["thread-comments", parsedId],
    queryFn: () => listComments(parsedId, { per_page: 50 }),
    enabled: validId,
    retry: false,
  });

  const thread = threadQuery.data;

  const banned = ban !== null || user?.is_banned === true;
  const banReason = ban?.reason ?? user?.ban_reason ?? null;
  const banExpiresAt = ban?.expiresAt ?? user?.ban_expires_at ?? null;

  if (!validId) {
    return <NotFound />;
  }

  if (threadQuery.isPending) {
    return <LoadingSkeleton />;
  }

  if (threadQuery.isError) {
    const error = threadQuery.error;
    if (error instanceof ApiError && error.status === 404) {
      return <NotFound />;
    }
    return (
      <div
        role="alert"
        className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-fg"
      >
        {error instanceof Error
          ? error.message
          : "Der Thread konnte nicht geladen werden."}
      </div>
    );
  }

  if (!thread) {
    return <NotFound />;
  }

  const threadId = thread.id;
  const isOwnThread = user != null && thread.author.id === user.id;
  const locked = thread.is_locked;
  const canModerate = user?.role === "moderator" || user?.role === "admin";

  const voteDisabled = banned || !user || isOwnThread;
  const voteDisabledReason = banned
    ? `Gesperrt: ${banReason ?? "Ohne Grund"}`
    : !user
      ? "Bitte anmelden, um abzustimmen."
      : isOwnThread
        ? "Eigene Inhalte können nicht bewertet werden."
        : undefined;

  const commentDisabled = banned || locked || !user;
  // The ban notice and the locked banner above already explain those states, so
  // the composer only carries the "not signed in" hint to avoid showing the
  // same message twice.
  const commentDisabledReason = !user
    ? "Bitte anmelden, um zu kommentieren."
    : undefined;

  async function handleCommentSubmit(body: string): Promise<void> {
    if (commentDisabled) return;
    setCommentSubmitting(true);
    setCommentError(null);
    try {
      await createComment(threadId, { body });
      await commentsQuery.refetch();
      await threadQuery.refetch();
    } catch (err) {
      const info = banFromError(err);
      if (info) {
        setBan(info);
      } else if (err instanceof ApiError) {
        setCommentError(err.message);
      } else {
        setCommentError("Kommentar konnte nicht gesendet werden.");
      }
    } finally {
      setCommentSubmitting(false);
    }
  }

  const comments = commentsQuery.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      {banned && <BannedNotice reason={banReason} expiresAt={banExpiresAt} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <article>
            <header className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {thread.is_pinned && (
                  <span className="badge badge-accent">Angepinnt</span>
                )}
                {thread.is_locked && (
                  <span className="badge badge-warning">Gesperrt</span>
                )}
                {thread.is_deleted && (
                  <span className="badge badge-danger">Entfernt</span>
                )}
              </div>

              <h1 className="text-2xl font-semibold">{thread.title}</h1>

              <p className="text-[13px] text-fg-muted">
                <Link
                  to={`/c/${thread.category.slug}`}
                  className="hover:text-accent hover:underline"
                >
                  {thread.category.name}
                </Link>
                {" · "}
                <Link
                  to={`/u/${thread.author.username}`}
                  className="hover:text-accent hover:underline"
                >
                  {thread.author.display_name || thread.author.username}
                </Link>
                {" · "}
                <time dateTime={thread.created_at}>
                  {formatRelativeTime(thread.created_at)}
                </time>
                {thread.edited_at && (
                  <>
                    {" · "}
                    <span>Bearbeitet</span>
                  </>
                )}
                {" · "}
                <span>Kommentare: {formatCount(thread.comment_count)}</span>
              </p>

              {thread.tags.length > 0 && (
                <ul className="flex flex-wrap gap-1">
                  {thread.tags.map((tag) => (
                    <li key={tag} className="badge">
                      #{tag}
                    </li>
                  ))}
                </ul>
              )}
            </header>

            <div className="mt-5 flex gap-4">
              <div className="shrink-0">
                <VoteButtons
                  targetType="thread"
                  targetId={thread.id}
                  score={thread.score}
                  value={thread.my_vote}
                  onVote={() => void threadQuery.refetch()}
                  disabled={voteDisabled}
                  disabledReason={voteDisabledReason}
                />
              </div>

              <div className="min-w-0 flex-1">
                {thread.is_deleted ? (
                  <p
                    className="italic"
                    style={{ color: "var(--color-fg-subtle)", fontSize: 16 }}
                  >
                    [gelöscht]
                  </p>
                ) : (
                  <MarkdownView
                    markdown={thread.body_markdown}
                    html={thread.body_html}
                  />
                )}
              </div>
            </div>
          </article>

          <section aria-labelledby="thread-comments-title" className="mt-8">
            <h2
              id="thread-comments-title"
              className="mb-4 text-[20px] font-semibold"
            >
              Kommentare
            </h2>

            {locked && (
              <p
                role="status"
                className="mb-4 rounded-md border border-warning px-4 py-3 text-sm"
                style={{
                  background: "var(--color-warning-soft)",
                  color: "var(--color-fg)",
                }}
              >
                Dieser Thread ist gesperrt. Neue Kommentare sind nicht möglich.
              </p>
            )}

            <CommentComposer
              onSubmit={(body) => void handleCommentSubmit(body)}
              disabled={commentDisabled}
              disabledReason={commentDisabledReason}
              submitting={commentSubmitting}
            />

            {commentError && (
              <p role="alert" className="mt-3 text-[13px] text-danger">
                {commentError}
              </p>
            )}

            <div className="mt-6">
              <CommentTree threadId={thread.id} comments={comments} />
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[72px] lg:self-start">
          <div className="card flex flex-col gap-3">
            <SubscribeButton threadId={thread.id} disabled={banned || !user} />
            <dl className="flex flex-col gap-2 text-[13px] text-fg-muted">
              <div className="flex justify-between gap-2">
                <dt>Kategorie</dt>
                <dd>
                  <Link
                    to={`/c/${thread.category.slug}`}
                    className="hover:text-accent hover:underline"
                  >
                    {thread.category.name}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Autor</dt>
                <dd>
                  <Link
                    to={`/u/${thread.author.username}`}
                    className="hover:text-accent hover:underline"
                  >
                    {thread.author.display_name || thread.author.username}
                  </Link>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Erstellt</dt>
                <dd>
                  <time dateTime={thread.created_at}>
                    {formatRelativeTime(thread.created_at)}
                  </time>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Punktzahl</dt>
                <dd className="tabular-nums">{formatScore(thread.score)}</dd>
              </div>
            </dl>
          </div>

          {canModerate && (
            <div className="card flex items-center justify-between gap-2">
              <span className="text-[14px] font-medium">Moderation</span>
              <ModerationMenu
                threadId={thread.id}
                isPinned={thread.is_pinned}
                isLocked={thread.is_locked}
                onAction={() => void threadQuery.refetch()}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default ThreadPage;
