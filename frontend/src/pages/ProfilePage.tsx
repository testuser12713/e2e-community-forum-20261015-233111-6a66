import { useRef, type KeyboardEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import {
  getUser,
  getUserComments,
  getUserThreads,
} from "../api/users";
import type { CommentSummary } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { ThreadCard } from "../components/ThreadCard";
import { PageSummary, Pagination } from "../components/Pagination";
import {
  formatAbsoluteDate,
  formatRelativeTime,
  formatScore,
} from "../lib/format";

const PER_PAGE = 20;

type ProfileTab = "threads" | "comments";

/** Up to two initials for the avatar fallback (DESIGN.md §UserCard). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Tabs({
  value,
  onChange,
}: {
  value: ProfileTab;
  onChange: (tab: ProfileTab) => void;
}) {
  const tabs: Array<{ value: ProfileTab; label: string }> = [
    { value: "threads", label: "Threads" },
    { value: "comments", label: "Kommentare" },
  ];
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + delta + tabs.length) % tabs.length;
    onChange(tabs[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Profilbereiche"
      className="inline-flex overflow-x-auto rounded-md border border-border bg-bg-subtle"
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.value}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          tabIndex={value === tab.value ? 0 : -1}
          className={
            "h-10 whitespace-nowrap px-4 text-sm font-medium " +
            (value === tab.value
              ? "rounded-md bg-surface text-fg shadow-sm"
              : "text-fg-muted hover:text-fg")
          }
          onClick={() => onChange(tab.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul
      role="status"
      aria-label="Einträge werden geladen"
      className="card overflow-hidden p-0"
    >
      <li className="p-4">
        <div className="h-4 w-1/3 animate-pulse rounded bg-bg-subtle" />
        <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-bg-subtle" />
      </li>
      <li className="border-t border-border p-4">
        <div className="h-4 w-2/5 animate-pulse rounded bg-bg-subtle" />
        <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-bg-subtle" />
      </li>
    </ul>
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

function CommentRow({ comment }: { comment: CommentSummary }) {
  return (
    <li className="border-b border-border p-4 last:border-b-0">
      <p className="text-[13px] text-fg-muted">
        in{" "}
        <Link
          to={`/t/${comment.thread_id}`}
          className="hover:text-accent hover:underline"
        >
          {comment.thread_title}
        </Link>
        {" · "}
        <time dateTime={comment.created_at}>
          {formatRelativeTime(comment.created_at)}
        </time>
      </p>
      <p className="mt-1 text-[15px] text-fg">
        {comment.is_deleted ? (
          <span className="italic text-fg-subtle">[gelöscht]</span>
        ) : (
          <span className="line-clamp-3">{comment.body_markdown}</span>
        )}
      </p>
      <p
        className="mt-1 text-[13px] text-fg-muted tabular-nums"
        title="Punktzahl"
        aria-label={`Punktzahl ${formatScore(comment.score)}`}
      >
        {formatScore(comment.score)}
      </p>
    </li>
  );
}

/**
 * The public profile page /u/:username (DESIGN.md §UserCard/ProfileHeader):
 * avatar, display name, bio, karma and the user's paginated threads and
 * comments. An unknown username renders the not-found state from the 404.
 */
export function ProfilePage() {
  const { username: rawUsername } = useParams<{ username: string }>();
  const username = rawUsername ?? "";
  const { user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get("tab");
  const tab: ProfileTab = rawTab === "comments" ? "comments" : "threads";
  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  function setTab(next: ProfileTab): void {
    const params = new URLSearchParams(searchParams);
    if (next === "threads") params.delete("tab");
    else params.set("tab", next);
    params.delete("page");
    setSearchParams(params);
  }

  function setPage(next: number): void {
    const params = new URLSearchParams(searchParams);
    if (next <= 1) params.delete("page");
    else params.set("page", String(next));
    setSearchParams(params);
  }

  const userQuery = useQuery({
    queryKey: ["user", username],
    queryFn: () => getUser(username),
    enabled: username !== "",
  });

  const profile = userQuery.data;
  const notFound =
    userQuery.error instanceof ApiError && userQuery.error.status === 404;

  const threadsQuery = useQuery({
    queryKey: ["user-threads", username, page],
    queryFn: () => getUserThreads(username, { page, per_page: PER_PAGE }),
    enabled: username !== "" && profile !== undefined && tab === "threads",
  });

  const commentsQuery = useQuery({
    queryKey: ["user-comments", username, page],
    queryFn: () => getUserComments(username, { page, per_page: PER_PAGE }),
    enabled: username !== "" && profile !== undefined && tab === "comments",
  });

  if (notFound) {
    return (
      <EmptyState
        title="Nutzer nicht gefunden"
        hint={`Es gibt keinen Nutzer „${username}“.`}
      />
    );
  }

  if (userQuery.isPending) {
    return (
      <section className="card empty-state" aria-label="Profil wird geladen">
        <p className="empty-state__hint">Das Profil wird geladen…</p>
      </section>
    );
  }

  if (userQuery.isError || !profile) {
    return (
      <div
        role="alert"
        className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-fg"
      >
        {userQuery.error instanceof Error
          ? userQuery.error.message
          : "Das Profil konnte nicht geladen werden."}
      </div>
    );
  }

  const isOwnProfile = currentUser?.username === profile.username;
  const displayName = profile.display_name || profile.username;

  const activeQuery = tab === "threads" ? threadsQuery : commentsQuery;
  const data = activeQuery.data;

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-4" aria-labelledby="profile-name">
        <div className="flex flex-wrap items-start gap-4">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xl font-semibold text-accent"
            >
              {initials(displayName)}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h1 id="profile-name" className="text-2xl font-semibold">
              {displayName}
            </h1>
            <p className="text-[13px] text-fg-muted">@{profile.username}</p>
            <p className="mt-1 text-[13px] text-fg-muted">
              Mitglied seit {formatAbsoluteDate(profile.created_at)}
            </p>
          </div>

          <div className="text-right">
            <p className="text-[13px] text-fg-muted">Karma</p>
            <p className="text-xl font-semibold tabular-nums">
              {formatScore(profile.karma)}
            </p>
          </div>

          {isOwnProfile && (
            <Link to="/settings" className="btn btn-secondary">
              Profil bearbeiten
            </Link>
          )}
        </div>

        {profile.bio ? (
          <p className="max-w-[68ch] text-[15px] leading-6 text-fg">
            {profile.bio}
          </p>
        ) : (
          <p className="text-[15px] text-fg-muted">Noch keine Bio.</p>
        )}
      </section>

      <Tabs value={tab} onChange={setTab} />

      {data && (
        <PageSummary page={data.page} pages={data.pages} total={data.total} />
      )}

      {activeQuery.isPending && <ListSkeleton />}

      {activeQuery.isError && (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-fg"
        >
          {activeQuery.error instanceof Error
            ? activeQuery.error.message
            : "Die Einträge konnten nicht geladen werden."}
        </div>
      )}

      {data && data.items.length === 0 && (
        <EmptyState
          title={
            page > 1
              ? "Keine Einträge auf dieser Seite"
              : tab === "threads"
                ? "Noch keine Threads"
                : "Noch keine Kommentare"
          }
          hint={
            page > 1
              ? "Diese Seite ist leer. Gehe zurück zur ersten Seite."
              : tab === "threads"
                ? "Dieser Nutzer hat noch keine Threads erstellt."
                : "Dieser Nutzer hat noch keine Kommentare geschrieben."
          }
        />
      )}

      {tab === "threads" && threadsQuery.data && threadsQuery.data.items.length > 0 && (
        <>
          <ul className="card overflow-hidden p-0">
            {threadsQuery.data.items.map((thread) => (
              <ThreadCard key={thread.id} thread={thread} />
            ))}
          </ul>
          <Pagination
            page={threadsQuery.data.page}
            pages={threadsQuery.data.pages}
            total={threadsQuery.data.total}
            perPage={threadsQuery.data.per_page}
            onPageChange={setPage}
          />
        </>
      )}

      {tab === "comments" && commentsQuery.data && commentsQuery.data.items.length > 0 && (
        <>
          <ul className="card overflow-hidden p-0">
            {commentsQuery.data.items.map((comment) => (
              <CommentRow key={comment.id} comment={comment} />
            ))}
          </ul>
          <Pagination
            page={commentsQuery.data.page}
            pages={commentsQuery.data.pages}
            total={commentsQuery.data.total}
            perPage={commentsQuery.data.per_page}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

export default ProfilePage;
