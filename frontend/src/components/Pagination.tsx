import { formatCount } from "../lib/format";

export interface PaginationProps {
  page: number;
  pages: number;
  total?: number;
  perPage?: number;
  onPageChange: (page: number) => void;
}

/** The 'Seite 2 von 7 · 132 Einträge' companion line above a list. */
export function PageSummary({
  page,
  pages,
  total,
}: {
  page: number;
  pages: number;
  total: number;
}) {
  return (
    <p className="text-[13px] text-fg-muted" data-testid="page-summary">
      Seite {formatCount(page)} von {formatCount(Math.max(pages, 1))} ·{" "}
      {formatCount(total)} Einträge
    </p>
  );
}

type PageItem = number | "ellipsis";

/** A window of at most five page numbers, with ellipses at either end. */
function pageWindow(page: number, pages: number): PageItem[] {
  if (pages <= 5) {
    return Array.from({ length: pages }, (_, index) => index + 1);
  }
  const items: PageItem[] = [1];
  const start = Math.min(Math.max(page - 1, 2), pages - 3);
  if (start > 2) items.push("ellipsis");
  for (let number = start; number < start + 3; number += 1) {
    items.push(number);
  }
  if (start + 2 < pages - 1) items.push("ellipsis");
  items.push(pages);
  return items;
}

/**
 * Page controls: 'Zurück' and 'Weiter' plus up to five numbered page buttons.
 * Disabled at the ends. A page beyond the last is handled by the caller as an
 * EmptyState, never as an error.
 */
export function Pagination({
  page,
  pages,
  onPageChange,
}: PaginationProps) {
  const pageCount = Math.max(pages, 0);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
      {pageCount > 1 && (
        <nav aria-label="Seitennavigation">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              Zurück
            </button>

            <ul className="flex items-center gap-2" role="list">
              {pageWindow(page, pageCount).map((item, index) =>
                item === "ellipsis" ? (
                  <li
                    key={`ellipsis-${index}`}
                    aria-hidden="true"
                    className="px-1 text-fg-muted"
                  >
                    …
                  </li>
                ) : (
                  <li key={item}>
                    <button
                      type="button"
                      className={
                        "flex h-11 w-11 items-center justify-center rounded-md text-[15px] font-medium md:h-9 md:w-9 " +
                        (item === page
                          ? "bg-accent text-accent-contrast"
                          : "text-fg-muted hover:bg-bg-subtle hover:text-fg")
                      }
                      aria-label={`Seite ${item}`}
                      aria-current={item === page ? "page" : undefined}
                      onClick={() => onPageChange(item)}
                    >
                      {item}
                    </button>
                  </li>
                ),
              )}
            </ul>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pageCount}
            >
              Weiter
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

export default Pagination;
