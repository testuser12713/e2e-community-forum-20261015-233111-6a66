import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  createComment,
  deleteComment,
  listComments,
  updateComment,
} from "../api/comments";
import { ApiError } from "../api/client";
import type { CommentNode } from "../api/types";
import { formatRelativeTime } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { CommentComposer } from "./CommentComposer";

/** DESIGN.md §CommentNode: replies nest up to depth 5; level 6 is rejected. */
export const MAX_COMMENT_DEPTH = 5;

export interface CommentTreeProps {
  threadId: number;
  /** Optional server-provided roots; the tree still refreshes after a post. */
  comments?: CommentNode[];
  /** Locked thread: the forms are disabled with this reason. */
  isLocked?: boolean;
  /** Called with the new total comment count after a successful change. */
  onCountChange?: (count: number) => void;
}

function countNodes(nodes: CommentNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1 + countNodes(node.replies);
  }
  return total;
}

function ReplyIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 17l-6-5 6-5" />
      <path d="M3 12h11a7 7 0 0 1 7 7v1" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="card empty-state" role="status">
      <p className="empty-state__title">{title}</p>
      <p className="empty-state__hint">{hint}</p>
    </div>
  );
}

/**
 * Nested comment tree (DESIGN.md §CommentNode).
 *
 * It reads the nested replies from GET /api/v1/threads/{id}/comments and
 * renders them recursively: 20px indent per level, a guide line for levels
 * 1-5, the '[gelöscht]' marker for soft-deleted nodes (their replies stay
 * visible) and the 'Bearbeitet' marker once edited_at is set. On one's own
 * comments it offers reply, edit and delete. Posting calls
 * POST /api/v1/threads/{id}/comments and refreshes the tree; the composer's
 * target stays visible beneath the comment it belongs to.
 */
export function CommentTree({
  threadId,
  comments,
  isLocked = false,
  onCountChange,
}: CommentTreeProps) {
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  const [nodes, setNodes] = useState<CommentNode[]>(comments ?? []);
  const [loading, setLoading] = useState<boolean>((comments ?? []).length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<CommentNode[]> => {
    const page = await listComments(threadId, { page: 1, per_page: 100 });
    setNodes(page.items);
    onCountChange?.(countNodes(page.items));
    return page.items;
  }, [threadId, onCountChange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    listComments(threadId, { page: 1, per_page: 100 })
      .then((page) => {
        if (cancelled) return;
        setNodes(page.items);
        onCountChange?.(countNodes(page.items));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Die Kommentare konnten nicht geladen werden.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  useEffect(() => {
    if (deletingId === null) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setDeletingId(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deletingId]);

  async function submitReply(parentId: number | null, body: string): Promise<void> {
    await createComment(threadId, { body, parent_id: parentId });
    setReplyToId(null);
    setEditingId(null);
    await refresh();
  }

  async function submitEdit(id: number, body: string): Promise<void> {
    await updateComment(id, body);
    setEditingId(null);
    await refresh();
  }

  async function confirmDelete(id: number): Promise<void> {
    setDeleteError(null);
    try {
      await deleteComment(id);
      setDeletingId(null);
      await refresh();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : "Der Kommentar konnte nicht gelöscht werden.",
      );
    }
  }

  function renderNode(node: CommentNode): ReactNode {
    const isOwn = currentUserId !== null && node.author?.id === currentUserId;
    const canReply = !node.is_deleted && !isLocked && node.depth < MAX_COMMENT_DEPTH;
    const canModify = isOwn && !node.is_deleted;
    const isEditing = editingId === node.id;

    return (
      <li key={node.id} data-comment-id={node.id}>
        <article
          data-depth={node.depth}
          className="rounded-md border-l-2 border-border pl-3"
        >
          <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-[18px] text-fg-muted">
            {node.author ? (
              <Link
                to={`/u/${node.author.username}`}
                className="font-medium text-fg hover:text-accent"
              >
                {node.author.display_name}
              </Link>
            ) : (
              <span className="font-medium italic">[gelöscht]</span>
            )}
            <span aria-hidden="true">·</span>
            <time dateTime={node.created_at}>
              {formatRelativeTime(node.created_at)}
            </time>
            {node.edited_at ? <span>· Bearbeitet</span> : null}
            {node.is_deleted ? (
              <span className="badge">Gelöscht</span>
            ) : null}
          </header>

          <div className="mt-1 max-w-[68ch] text-[16px] leading-[26px]">
            {node.is_deleted ? (
              <p className="italic text-fg-subtle">[gelöscht]</p>
            ) : (
              <div dangerouslySetInnerHTML={{ __html: node.body_html }} />
            )}
          </div>

          {isEditing ? (
            <div className="mt-2">
              <CommentComposer
                label="Kommentar bearbeiten"
                initialValue={node.body_markdown}
                submitLabel="Änderungen speichern"
                autoFocus
                onCancel={() => setEditingId(null)}
                onSubmit={(body) => submitEdit(node.id, body)}
              />
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {canReply ? (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Antworten"
                  title="Antworten"
                  aria-expanded={replyToId === node.id}
                  onClick={() =>
                    setReplyToId((current) =>
                      current === node.id ? null : node.id,
                    )
                  }
                >
                  <ReplyIcon />
                </button>
              ) : null}
              {canModify ? (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Bearbeiten"
                  title="Bearbeiten"
                  onClick={() => {
                    setEditingId(node.id);
                    setReplyToId(null);
                  }}
                >
                  <EditIcon />
                </button>
              ) : null}
              {canModify ? (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Löschen"
                  title="Löschen"
                  onClick={() => {
                    setDeleteError(null);
                    setDeletingId(node.id);
                  }}
                >
                  <TrashIcon />
                </button>
              ) : null}
            </div>
          )}

          {replyToId === node.id && !isEditing ? (
            <div className="mt-2 rounded-md border border-border bg-bg-subtle p-3">
              <CommentComposer
                label={
                  node.author
                    ? `Antwort an @${node.author.username}`
                    : "Antwort"
                }
                placeholder="Deine Antwort…"
                submitLabel="Antwort senden"
                autoFocus
                onCancel={() => setReplyToId(null)}
                onSubmit={(body) => submitReply(node.id, body)}
              />
            </div>
          ) : null}
        </article>

        {node.replies.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2" style={{ marginLeft: 20 }}>
            {node.replies.map(renderNode)}
          </ul>
        ) : null}
      </li>
    );
  }

  const deletingNode = deletingId === null ? null : findNode(nodes, deletingId);

  return (
    <section aria-label="Kommentare" className="flex flex-col gap-4">
      {loading ? (
        <div className="card" role="status" aria-label="Kommentare werden geladen">
          <div className="h-4 w-1/3 animate-pulse rounded bg-bg-subtle" />
          <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-bg-subtle" />
        </div>
      ) : null}

      {loadError ? (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-fg"
        >
          {loadError}
        </div>
      ) : null}

      {!loading && !loadError && nodes.length === 0 ? (
        <EmptyState
          title="Noch keine Kommentare"
          hint="Sei die erste Person und starte die Diskussion."
        />
      ) : null}

      {nodes.length > 0 ? (
        <ul className="flex flex-col gap-4">{nodes.map(renderNode)}</ul>
      ) : null}

      <div className="rounded-lg border border-border p-4">
        <CommentComposer
          label="Kommentar verfassen"
          placeholder="Schreibe einen Kommentar…"
          disabled={isLocked}
          disabledReason={
            isLocked
              ? "Dieser Thread ist gesperrt – neue Kommentare sind nicht möglich."
              : undefined
          }
          onSubmit={(body) => submitReply(null, body)}
        />
      </div>

      {deletingNode ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "var(--color-overlay)" }}
          role="presentation"
          onClick={() => setDeletingId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Kommentar löschen"
            className="card card-raised w-full p-6"
            style={{ maxWidth: "min(480px, calc(100vw - 32px))" }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-[20px] font-semibold">Kommentar löschen?</h2>
            <p className="mt-2 text-[15px] text-fg-muted">
              Der Kommentar wird mit „[gelöscht]“ markiert; Antworten bleiben
              sichtbar.
            </p>
            {deleteError ? (
              <p role="alert" className="mt-2 text-[13px] text-danger">
                {deleteError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                autoFocus
                onClick={() => setDeletingId(null)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void confirmDelete(deletingNode.id)}
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function findNode(nodes: CommentNode[], id: number): CommentNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.replies, id);
    if (found) return found;
  }
  return null;
}

export default CommentTree;
