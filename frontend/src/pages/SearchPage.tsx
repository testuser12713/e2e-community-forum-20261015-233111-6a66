import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { searchThreads } from "../api/search";
import { listCategories } from "../api/categories";
import { ApiError } from "../api/client";
import { ThreadCard } from "../components/ThreadCard";
import { SearchFilters } from "../components/SearchFilters";
import { Pagination } from "../components/Pagination";

const DEFAULT_PER_PAGE = 20;

function parsePage(raw: string | null): number {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

function ResultSkeleton() {
  return (
    <ul
      className="card divide-y divide-border overflow-hidden p-0"
      role="status"
      aria-label="Suchergebnisse werden geladen"
    >
      {[0, 1, 2].map((row) => (
        <li key={row} className="p-4" aria-hidden="true">
          <span className="block h-4 w-2/3 animate-pulse rounded-sm bg-bg-subtle" />
          <span className="mt-2 block h-3 w-1/3 animate-pulse rounded-sm bg-bg-subtle" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Full-text search page (AC-20).
 *
 * The term, the category, the tag and the page live in the URL, so a reload
 * keeps the filters and a shared link reproduces the search. Every change
 * re-queries GET /api/v1/search; the hit list renders the shared ThreadCard.
 * Loading, empty and error states are rendered explicitly — an empty result
 * is an EmptyState, never an error.
 */
export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const category = searchParams.get("category") ?? "";
  const tag = searchParams.get("tag") ?? "";
  const page = parsePage(searchParams.get("page"));
  const trimmedQuery = q.trim();

  function updateParams(updates: Record<string, string>): void {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  }

  const {
    data: categoriesPage,
  } = useQuery({
    queryKey: ["categories", "search-filter"],
    queryFn: () => listCategories({ page: 1, per_page: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const {
    data,
    isPending,
    isError,
    error,
  } = useQuery({
    queryKey: ["search", trimmedQuery, category, tag, page, DEFAULT_PER_PAGE],
    queryFn: () =>
      searchThreads({
        q: trimmedQuery,
        category: category || undefined,
        tag: tag || undefined,
        page,
        per_page: DEFAULT_PER_PAGE,
      }),
    enabled: trimmedQuery.length > 0,
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const isLoading = trimmedQuery.length > 0 && isPending;

  return (
    <section aria-label="Suche">
      <h1 className="mb-4 text-2xl font-semibold text-fg">Suche</h1>

      <SearchFilters
        q={q}
        category={category}
        tag={tag}
        categories={categoriesPage?.items ?? []}
        onQueryChange={(value) => updateParams({ q: value, page: "" })}
        onCategoryChange={(value) => updateParams({ category: value, page: "" })}
        onTagChange={(value) => updateParams({ tag: value, page: "" })}
        onSubmit={() => updateParams({ q: trimmedQuery, page: "" })}
      />

      {trimmedQuery.length === 0 ? (
        <div className="card empty-state">
          <p className="empty-state__title">Wonach suchst du?</p>
          <p className="empty-state__hint">
            Gib einen Suchbegriff ein, um Threads zu finden.
          </p>
        </div>
      ) : isLoading ? (
        <ResultSkeleton />
      ) : isError ? (
        <div
          className="rounded-md border border-danger bg-danger-soft px-4 py-3"
          role="alert"
        >
          <p className="text-[14px] text-fg">
            {error instanceof ApiError
              ? error.message
              : "Die Suche ist fehlgeschlagen. Bitte versuche es erneut."}
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <p className="empty-state__title">
            Keine Treffer für &bdquo;{trimmedQuery}&ldquo;
          </p>
          <p className="empty-state__hint">
            Versuche einen anderen Begriff oder entferne einen Filter.
          </p>
        </div>
      ) : (
        <>
          <ul
            className="card divide-y divide-border overflow-hidden p-0"
            aria-label="Suchergebnisse"
          >
            {items.map((thread) => (
              <li key={thread.id} data-testid="search-result">
                <ThreadCard thread={thread} />
              </li>
            ))}
          </ul>

          {data && data.pages > 1 ? (
            <div className="mt-4">
              <Pagination
                page={data.page}
                pages={data.pages}
                total={data.total}
                perPage={data.per_page}
                onPageChange={(next) =>
                  updateParams({ page: next > 1 ? String(next) : "" })
                }
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export default SearchPage;
