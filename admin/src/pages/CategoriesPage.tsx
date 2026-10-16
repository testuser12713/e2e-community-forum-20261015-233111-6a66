import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import {
  createCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} from "../api/admin";
import type { CategoryOut, CategoryWrite } from "../api/types";
import CategoryForm from "../components/CategoryForm";

/**
 * Admin category management.
 *
 * Lists every category from GET /api/v1/categories, lets an administrator
 * create (POST /api/v1/admin/categories) and edit
 * (PATCH /api/v1/admin/categories/{id}) them and reorder the list, which is
 * sent as the reordered id list to PUT /api/v1/admin/categories/order.
 *
 * A full page of categories is loaded at once (per_page=100), because a reorder
 * always describes the complete order of the list.
 */

const PER_PAGE = 100;

function UpIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function DownIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M19 12l-7 7-7-7" />
    </svg>
  );
}

function SkeletonRows() {
  return (
    <div data-testid="category-skeleton" className="flex flex-col gap-2">
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="h-14 animate-pulse rounded-md bg-bg-subtle"
        />
      ))}
    </div>
  );
}

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [page] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CategoryOut | null>(null);
  const [items, setItems] = useState<CategoryOut[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin-categories", page],
    queryFn: () => listCategories({ page, per_page: PER_PAGE }),
  });

  useEffect(() => {
    if (query.data) {
      setItems(query.data.items);
    }
  }, [query.data]);

  const createMutation = useMutation({
    mutationFn: (payload: CategoryWrite) => createCategory(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      setStatus("Kategorie gespeichert");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: number; patch: CategoryWrite }) =>
      updateCategory(vars.id, vars.patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      setStatus("Kategorie gespeichert");
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => reorderCategories(ids),
  });

  function openCreate() {
    setEditing(null);
    setCreating(true);
    setListError(null);
  }

  function openEdit(category: CategoryOut) {
    setEditing(category);
    setCreating(false);
    setListError(null);
  }

  function closeForm() {
    setCreating(false);
    setEditing(null);
  }

  async function handleSubmit(payload: CategoryWrite): Promise<void> {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, patch: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    closeForm();
  }

  async function move(index: number, direction: -1 | 1): Promise<void> {
    const target = index + direction;
    if (target < 0 || target >= items.length) {
      return;
    }
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
    setListError(null);
    try {
      const result = await reorderMutation.mutateAsync(next.map((c) => c.id));
      setItems(result.items);
      queryClient.setQueryData(["admin-categories", page], result);
      setStatus("Reihenfolge gespeichert");
    } catch (err) {
      setItems(query.data?.items ?? []);
      setListError(
        err instanceof ApiError
          ? err.message
          : "Reihenfolge konnte nicht gespeichert werden.",
      );
    }
  }

  const loadError =
    query.error instanceof ApiError
      ? query.error.message
      : query.isError
        ? "Kategorien konnten nicht geladen werden."
        : null;

  const formOpen = creating || editing !== null;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-fg">Kategorien</h1>
          <p className="max-w-[68ch] text-sm text-fg-muted">
            Kategorien anlegen, bearbeiten und per Pfeiltasten umsortieren. Die
            Reihenfolge erscheint ebenso in der Kategorienliste des Forums.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-11 items-center rounded-md bg-accent px-5 text-[15px] font-semibold text-accent-contrast transition-colors duration-100 hover:bg-accent-hover active:translate-y-px active:bg-accent-active"
        >
          Neue Kategorie
        </button>
      </header>

      {formOpen && (
        <div className="rounded-lg border border-border bg-surface p-4 md:p-6">
          <h2 className="mb-4 text-lg font-semibold text-fg">
            {editing ? "Kategorie bearbeiten" : "Neue Kategorie"}
          </h2>
          <CategoryForm
            initial={editing}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        </div>
      )}

      {listError && (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-fg"
        >
          {listError}
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface">
        {query.isLoading ? (
          <div className="p-4 md:p-6">
            <SkeletonRows />
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="p-6 text-sm text-danger md:p-8"
          >
            {loadError}
          </div>
        ) : items.length === 0 ? (
          <div
            data-testid="category-empty"
            className="flex flex-col items-center gap-2 px-4 py-12 text-center"
          >
            <p className="text-base font-semibold text-fg">
              Noch keine Kategorien
            </p>
            <p className="max-w-[48ch] text-[13px] text-fg-muted">
              Lege mit „Neue Kategorie“ die erste Kategorie an.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((category, index) => (
              <li
                key={category.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-6"
              >
                <div className="min-w-0 flex-1">
                  <span className="block text-[17px] font-semibold text-fg">
                    {category.name}
                  </span>
                  <span className="block text-[13px] text-fg-muted">
                    Position {index + 1}
                  </span>
                  {category.description && (
                    <p className="mt-1 max-w-[68ch] text-[13px] text-fg-muted">
                      {category.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    aria-label={`${category.name} nach oben`}
                    title="Nach oben"
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                    className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors duration-100 after:absolute after:-inset-1.5 after:content-[''] hover:bg-bg-subtle hover:text-fg disabled:cursor-not-allowed disabled:text-fg-subtle disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-subtle"
                  >
                    <UpIcon />
                  </button>
                  <button
                    type="button"
                    aria-label={`${category.name} nach unten`}
                    title="Nach unten"
                    disabled={index === items.length - 1}
                    onClick={() => void move(index, 1)}
                    className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted transition-colors duration-100 after:absolute after:-inset-1.5 after:content-[''] hover:bg-bg-subtle hover:text-fg disabled:cursor-not-allowed disabled:text-fg-subtle disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-fg-subtle"
                  >
                    <DownIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(category)}
                    className="inline-flex h-11 items-center rounded-md border border-border bg-surface px-4 text-sm font-semibold text-fg transition-colors duration-100 hover:border-border-strong hover:bg-bg-subtle"
                  >
                    Bearbeiten
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {status ?? ""}
      </p>
    </section>
  );
}
