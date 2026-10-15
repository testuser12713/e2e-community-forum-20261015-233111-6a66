import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import {
  getUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
} from "../api/notifications";
import { formatRelativeTime } from "../lib/format";
import type { NotificationOut, UnreadCount } from "../api/types";

/**
 * Shared notification query keys. The bell and the notifications page live in
 * different mounts, so they read and update the same React Query cache: marking
 * a notification read anywhere lowers the bell's unread count without a reload.
 */
export const NOTIFICATIONS_QUERY_PREFIX = "notifications";
export const UNREAD_COUNT_QUERY_KEY = ["notifications", "unread-count"] as const;
export const RECENT_NOTIFICATIONS_QUERY_KEY = [
  "notifications",
  "recent",
] as const;

const POLL_INTERVAL_MS = 30_000;
const RECENT_LIMIT = 5;

/** German one-line description of a notification (type + actor). */
export function notificationMessage(notification: NotificationOut): string {
  const actor =
    notification.actor?.display_name || notification.actor?.username || "Jemand";
  switch (notification.type) {
    case "reply":
      return `${actor} hat auf deinen Beitrag geantwortet`;
    case "mention":
      return `${actor} hat dich erwähnt`;
    case "thread_comment":
      return `${actor} hat in einem abonnierten Thread kommentiert`;
    default:
      return `${actor} hat dich benachrichtigt`;
  }
}

/** Deep link to the thread (and comment) a notification points at. */
export function notificationTargetPath(notification: NotificationOut): string {
  const base = `/t/${notification.thread_id}`;
  return notification.comment_id
    ? `${base}#comment-${notification.comment_id}`
    : base;
}

/**
 * Mark one notification read and lower the shared unread counter. Used by both
 * the bell panel and the notifications page so the two stay in sync.
 */
export function useMarkNotificationRead(): (id: number) => Promise<void> {
  const queryClient = useQueryClient();
  return async (id: number): Promise<void> => {
    await markRead(id);
    queryClient.setQueryData<UnreadCount>(UNREAD_COUNT_QUERY_KEY, (current) =>
      current ? { unread: Math.max(0, current.unread - 1) } : current,
    );
    await queryClient.invalidateQueries({
      queryKey: [NOTIFICATIONS_QUERY_PREFIX],
    });
  };
}

/** Mark every notification read and set the shared unread counter to 0. */
export function useMarkAllNotificationsRead(): () => Promise<void> {
  const queryClient = useQueryClient();
  return async (): Promise<void> => {
    await markAllRead();
    queryClient.setQueryData<UnreadCount>(UNREAD_COUNT_QUERY_KEY, { unread: 0 });
    await queryClient.invalidateQueries({
      queryKey: [NOTIFICATIONS_QUERY_PREFIX],
    });
  };
}

function BellIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

/**
 * Notification bell (AC-23). Shows the unread count from
 * GET /api/v1/notifications/unread-count (polled), opens a panel with the most
 * recent notifications and links to /notifications. Marking items read updates
 * the count through the shared cache without a reload.
 */
export function NotificationBell() {
  const { user } = useAuth();
  const isAuthenticated = user !== null;

  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const markOne = useMarkNotificationRead();
  const markEverything = useMarkAllNotificationsRead();

  const unreadQuery = useQuery({
    queryKey: UNREAD_COUNT_QUERY_KEY,
    queryFn: getUnreadCount,
    enabled: isAuthenticated,
    refetchInterval: isAuthenticated ? POLL_INTERVAL_MS : false,
  });

  const recentQuery = useQuery({
    queryKey: RECENT_NOTIFICATIONS_QUERY_KEY,
    queryFn: () => listNotifications({ page: 1, per_page: RECENT_LIMIT }),
    enabled: open && isAuthenticated,
  });

  const unread = unreadQuery.data?.unread ?? 0;
  const badgeLabel = unread > 99 ? "99+" : String(unread);

  useEffect(() => {
    if (!open) return;
    function updatePosition(): void {
      const element = buttonRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleMarkOne(id: number): Promise<void> {
    try {
      await markOne(id);
    } catch {
      /* keep the current state; the poll refreshes it later */
    }
  }

  async function handleMarkAll(): Promise<void> {
    try {
      await markEverything();
    } catch {
      /* keep the current state; the poll refreshes it later */
    }
  }

  return (
    <div className="relative inline-flex" ref={containerRef}>
      <button
        type="button"
        ref={buttonRef}
        className="icon-btn relative"
        aria-label={
          unread > 0
            ? `Benachrichtigungen, ${unread} ungelesen`
            : "Benachrichtigungen"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        <BellIcon />
        {unread > 0 && (
          <span
            data-testid="notification-badge"
            className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-accent-contrast"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Benachrichtigungen"
          style={{
            position: "fixed",
            top: position?.top,
            right: position?.right,
            width: "min(360px, calc(100vw - 32px))",
          }}
          className="z-30 max-h-[70vh] overflow-auto rounded-lg border border-border bg-surface-raised shadow-[var(--shadow-raised)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <span className="text-[15px] font-semibold">
              Benachrichtigungen
            </span>
            {isAuthenticated && (
              <button
                type="button"
                className="text-[13px] font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void handleMarkAll()}
                disabled={unread === 0}
              >
                Alle als gelesen markieren
              </button>
            )}
          </div>

          {!isAuthenticated ? (
            <p className="px-4 py-6 text-center text-[13px] text-fg-muted">
              Bitte melde dich an, um Benachrichtigungen zu sehen.{" "}
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="font-medium text-accent hover:underline"
              >
                Anmelden
              </Link>
            </p>
          ) : (
            <>
              {recentQuery.isPending && (
                <p className="px-4 py-4 text-[13px] text-fg-muted">Lädt…</p>
              )}

              {recentQuery.isError && (
                <p className="px-4 py-4 text-[13px] text-danger">
                  Benachrichtigungen konnten nicht geladen werden.
                </p>
              )}

              {recentQuery.data && recentQuery.data.items.length === 0 && (
                <p className="px-4 py-6 text-center text-[13px] text-fg-muted">
                  Keine Benachrichtigungen
                </p>
              )}

              {recentQuery.data && recentQuery.data.items.length > 0 && (
                <ul className="m-0 list-none p-0">
                  {recentQuery.data.items.map((notification) => (
                    <li
                      key={notification.id}
                      className={
                        "flex min-h-[64px] flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0 " +
                        (notification.is_read ? "" : "bg-accent-soft")
                      }
                    >
                      <div className="flex items-start gap-2">
                        {!notification.is_read && (
                          <span
                            className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                            aria-hidden="true"
                          />
                        )}
                        <Link
                          to={notificationTargetPath(notification)}
                          onClick={() => setOpen(false)}
                          className="min-w-0 flex-1 text-[13px] hover:text-accent hover:underline"
                        >
                          {notificationMessage(notification)}
                        </Link>
                      </div>
                      <div className="flex items-center justify-between gap-2 pl-3.5 text-[12px] text-fg-muted">
                        <time dateTime={notification.created_at}>
                          {formatRelativeTime(notification.created_at)}
                        </time>
                        {!notification.is_read && (
                          <button
                            type="button"
                            className="font-medium text-accent hover:underline"
                            onClick={() => void handleMarkOne(notification.id)}
                          >
                            Als gelesen markieren
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <div className="border-t border-border px-4 py-2 text-center">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-[13px] font-medium text-accent hover:underline"
            >
              Alle anzeigen
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
