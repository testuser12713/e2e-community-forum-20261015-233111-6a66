import { useRef, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listThreads, type ThreadSort } from "../api/threads";
import { listCategories } from "../api/categories";
import { ThreadCard } from "./ThreadCard";
import { PageSummary, Pagination } from "./Pagination";

const SORTS: Array<{ value: ThreadSort; label: string }> = [
  { value: "new", label: "Neu" },
  { value: "top", label: "Top" },
  { value: "hot", label: "Hot" },
];

const PER_PAGE = 20;

function SortTabs({
  value,
  onChange,
}: {
  value: ThreadSort;
  onChange: (sort: ThreadSort) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + delta + SORTS.length) % SORTS.length;
    onChange(SORTS[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Sortierung"
      className="inline-flex overflow-x-auto rounded-md border border-border bg-bg-subtle"
    >
      {SORTS.map((sort, index) => (
        <button
          key={sort.value}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="button"
          role="tab"
          aria-selected={value === sort.value}
          tabIndex={value === sort.value ? 0 : -1}
          className={
            "h-10 whitespace-nowrap px-4 text-sm font-medium " +
            (value === sort.value
              ? "rounded-md bg-surface text-fg shadow-sm"
              : "text-fg-muted hover:text-fg")
          }
          onClick={() => onChange(sort.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {sort.label}
        </button>
      ))}
    </div>
  );
}

function CategoryNav({ activeSlug }: { activeSlug?: string }) {
  const { data } = useQuery({
    queryKey: ["categories", { page: 1, per_page: 100 }],
    queryFn: () => listCategories({ page: 1, per_page: 100 }),
  });

  if (!data) return null;

  return (
    <nav aria-label="Kategorien">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            to="/"
            className={
              "badge hover:border-accent hover:text-accent " +
              (!activeSlug ? "badge-accent" : "")
            }
            aria-current={!activeSlug ? "page" : undefined}
          >
            Alle
          </Link>
        </li>
        {data.items.map((category) => (
          <li key={category.id}>
            <Link
              to={`/c/${category.slug}`}
              className={
                "badge hover:border-accent hover:text-accent " +
                (activeSlug === category.slug ? "badge-accent" : "")
              }
              aria-current={activeSlug === category.slug ? "page" : undefined}
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ThreadListSkeleton() {
  return (
    <ul
      role="status"
      aria-label="Threads werden geladen"
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
      <li className="border-t border-border p-4">
        <div className="h-4 w-1/2 animate-pulse rounded bg-bg-subtle" />
        <div className="mt-3 h-3 w-1/3 animate-pulse rounded bg-bg-subtle" />
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

/**
 * The forum feed shared by HomePage (all categories) and CategoryPage (one
 * category): sort tabs, category navigation, tag filter, the paginated thread
 * list and its loading, empty and error states.
 */
export function ThreadFeed({ category }: { category?: string }) {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawSort = searchParams.get("sort");
  const sort: ThreadSort =
    rawSort === "top" || rawSort === "hot" ? rawSort : "new";
  const tag = searchParams.get("tag") ?? undefined;
  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  function updateParams(changes: {
    sort?: ThreadSort;
    tag?: string;
    page?: number;
  }) {
    const next = new URLSearchParams(searchParams);
    if (changes.sort !== undefined) {
      if (changes.sort === "new") next.delete("sort");
      else next.set("sort", changes.sort);
    }
    if (changes.tag !== undefined) {
      if (changes.tag === "") next.delete("tag");
      else next.set("tag", changes.tag);
    }
    if (changes.page !== undefined) {
      if (changes.page <= 1) next.delete("page");
      else next.set("page", String(changes.page));
    }
    setSearchParams(next);
  }

  const threadsQuery = useQuery({
    queryKey: ["threads", { sort, category: category ?? null, tag: tag ?? null, page, per_page: PER_PAGE }],
    queryFn: () =>
      listThreads({ sort, category, tag, page, per_page: PER_PAGE }),
  });

  const data = threadsQuery.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SortTabs value={sort} onChange={(next) => updateParams({ sort: next, page: 1 })} />
        {tag && (
          <span className="inline-flex items-center gap-2">
            <span className="badge badge-accent">Tag: #{tag}</span>
            <button
              type="button"
              className="icon-btn h-8 w-8 p-0"
              aria-label={`Filter „${tag}“ entfernen`}
              onClick={() => updateParams({ tag: "", page: 1 })}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </span>
        )}
      </div>

      <CategoryNav activeSlug={category} />

      {data && (
        <PageSummary page={data.page} pages={data.pages} total={data.total} />
      )}

      {threadsQuery.isPending && <ThreadListSkeleton />}

      {threadsQuery.isError && (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-fg"
        >
          {threadsQuery.error instanceof Error
            ? threadsQuery.error.message
            : "Die Threads konnten nicht geladen werden."}
        </div>
      )}

      {data && data.items.length === 0 && (
        <EmptyState
          title={
            page > 1 ? "Keine Einträge auf dieser Seite" : "Keine Threads"
          }
          hint={
            page > 1
              ? "Diese Seite ist leer. Gehe zurück zur ersten Seite."
              : "Für diese Auswahl gibt es noch keine Threads."
          }
        />
      )}

      {data && data.items.length > 0 && (
        <>
          <ul className="card overflow-hidden p-0">
            {data.items.map((thread) => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                onTagClick={(nextTag) =>
                  updateParams({ tag: nextTag, page: 1 })
                }
              />
            ))}
          </ul>
          <Pagination
            page={data.page}
            pages={data.pages}
            total={data.total}
            perPage={data.per_page}
            onPageChange={(next) => updateParams({ page: next })}
          />
        </>
      )}
    </div>
  );
}

export default ThreadFeed;
