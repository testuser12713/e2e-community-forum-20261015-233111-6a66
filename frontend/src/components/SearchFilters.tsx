import type { CategoryOut } from "../api/types";

export interface SearchFiltersProps {
  /** The current search term (q), controlled by the URL. */
  q: string;
  /** The selected category slug, or "" for all categories. */
  category: string;
  /** The current tag filter, or "". */
  tag: string;
  /** The categories offered in the select. */
  categories: CategoryOut[];
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onTagChange: (value: string) => void;
  /** Called when the form is submitted (Enter / Suchen). */
  onSubmit?: () => void;
}

const labelClass =
  "mb-1 block text-[13px] font-medium leading-[18px] text-fg-muted";

/**
 * The search filter bar: a term field, a category select and a tag field.
 * Every field is controlled by the caller, which keeps the values in the URL
 * so a reload keeps the filters (AC-20). Nothing here is decoration — each
 * control changes the query.
 */
export function SearchFilters({
  q,
  category,
  tag,
  categories,
  onQueryChange,
  onCategoryChange,
  onTagChange,
  onSubmit,
}: SearchFiltersProps) {
  return (
    <form
      role="search"
      className="mb-6 flex flex-col gap-3 md:flex-row md:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <div className="md:flex-1">
        <label htmlFor="search-q" className={labelClass}>
          Suchbegriff
        </label>
        <input
          id="search-q"
          type="search"
          className="input"
          value={q}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Threads durchsuchen…"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="md:w-56">
        <label htmlFor="search-category" className={labelClass}>
          Kategorie
        </label>
        <select
          id="search-category"
          className="input"
          value={category}
          onChange={(event) => onCategoryChange(event.target.value)}
        >
          <option value="">Alle Kategorien</option>
          {categories.map((item) => (
            <option key={item.id} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      <div className="md:w-48">
        <label htmlFor="search-tag" className={labelClass}>
          Tag
        </label>
        <input
          id="search-tag"
          type="text"
          className="input"
          value={tag}
          onChange={(event) => onTagChange(event.target.value)}
          placeholder="z. B. hilfe"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <button type="submit" className="btn btn-primary">
        Suchen
      </button>
    </form>
  );
}

export default SearchFilters;
