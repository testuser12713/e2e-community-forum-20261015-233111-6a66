import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { getUnreadCount, listNotifications } from "../api/notifications";
import { formatRelativeTime } from "../lib/format";
import { PageSummary, Pagination } from "../components/Pagination";
import {
  NOTIFICATIONS_QUERY_PREFIX,
  UNREAD_COUNT_QUERY_KEY,
  notificationMessage,
  notificationTargetPath,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from "../components/NotificationBell";

const PER_PAGE = 20;

function ListSkeleton() {
  return (
    <ul className="card m-0 list-none overflow-hidden p-0" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <li key={row} className="border-b border-border p-4 last:border-b-0">
          <div className="h-4 w-3/5 animate-pulse rounded bg-bg-subtle" />
          <div className="mt-3 h-3 w-1/3 animate-pulse rounded bg-bg-subtle" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Notifications page (AC-23): the paginated list of notifications with their
 * type, actor, target thread and read state. Marking one read or all read
 * updates the shared unread counter (and therefore the bell) without a reload.
 */
export function NotificationsPage() {
  const { user } = useAuth();
  const isAuthenticated = user !== null;

  const [searchParams, setSearchParams] = useSearchParams();
  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  const [pending, setPending] = useState<number | "all" | null>(null);

  const markOne = useMarkNotificationRead();
  const markEverything = useMarkAllNotificationsRead();

  const listQuery = useQuery({
    queryKey: [NOTIFICATIONS_QUERY_PREFIX, "list", page, PER_PAGE],
    queryFn: () => listNotifications({ page, per_page: PER_PAGE }),
    enabled: isAuthenticated,
  });

  const unreadQuery = useQuery({
    queryKey: UNREAD_COUNT_QUERY_KEY,
    queryFn: getUnreadCount,
    enabled: isAuthenticated,
  });

  const unread = unreadQuery.data?.unread ?? 0;
  const data = listQuery.data;

  function goToPage(next: number): void {
    const params = new URLSearchParams(searchParams);
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    setSearchParams(params);
  }

  async function handleMarkOne(id: number): Promise<void> {
    if (pending !== null) return;
    setPending(id);
    try {
      await markOne(id);
    } catch {
      /* the list refetch leaves the accurate state */
    } finally {
      setPending(null);
    }
  }

  async function handleMarkAll(): Promise<void> {
    if (pending !== null) return;
    setPending("all");
    try {
      await markEverything();
    } catch {
      /* the list refetch leaves the accurate state */
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="page-section flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Benachrichtigungen</h1>
        {isAuthenticated && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleMarkAll()}
            disabled={unread === 0 || pending !== null}
          >
            Alle als gelesen markieren
          </button>
        )}
      </div>

      {!isAuthenticated && (
        <div className="card empty-state" role="status">
          <p className="empty-state__title">Anmeldung erforderlich</p>
          <p className="empty-state__hint">
            Bitte melde dich an, um deine Benachrichtigungen zu sehen.
          </p>
          <Link to="/login" className="btn btn-primary">
            Anmelden
          </Link>
        </div>
      )}

      {isAuthenticated && data && (
        <PageSummary page={data.page} pages={data.pages} total={data.total} />
      )}

      {isAuthenticated && listQuery.isPending && <ListSkeleton />}

      {isAuthenticated && listQuery.isError && (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-fg"
        >
          {listQuery.error instanceof Error
            ? listQuery.error.message
            : "Die Benachrichtigungen konnten nicht geladen werden."}
        </div>
      )}

      {isAuthenticated && data && data.items.length === 0 && (
        <div className="card empty-state" role="status">
          <p className="empty-state__title">Keine Benachrichtigungen</p>
          <p className="empty-state__hint">
            Hier erscheinen Antworten, Erwähnungen und neue Kommentare.
          </p>
        </div>
      )}

      {isAuthenticated && data && data.items.length > 0 && (
        <ul className="card m-0 list-none overflow-hidden p-0">
          {data.items.map((notification) => (
            <li
              key={notification.id}
              className={
                "flex flex-col gap-2 border-b border-border p-4 last:border-b-0 " +
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
                <div className="min-w-0 flex-1">
                  <p className="text-[15px]">
                    <Link
                      to={notificationTargetPath(notification)}
                      className="hover:text-accent hover:underline"
                    >
                      {notificationMessage(notification)}
                    </Link>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
                    <time dateTime={notification.created_at}>
                      {formatRelativeTime(notification.created_at)}
                    </time>
                    <span aria-hidden="true">·</span>
                    <Link
                      to={`/t/${notification.thread_id}`}
                      className="hover:text-accent hover:underline"
                    >
                      Thread öffnen
                    </Link>
                    {!notification.is_read && (
                      <span className="badge badge-accent">Ungelesen</span>
                    )}
                  </p>
                </div>
                {!notification.is_read && (
                  <button
                    type="button"
                    className="btn btn-ghost shrink-0"
                    onClick={() => void handleMarkOne(notification.id)}
                    disabled={pending !== null}
                  >
                    Als gelesen markieren
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isAuthenticated && data && (
        <Pagination
          page={data.page}
          pages={data.pages}
          onPageChange={goToPage}
        />
      )}
    </section>
  );
}

export default NotificationsPage;
