import { useEffect, useRef, useState } from "react";
import * as moderationApi from "../api/moderation";
import * as categoriesApi from "../api/categories";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type {
  CategoryOut,
  ModerationAction,
  ModerateThreadInput,
} from "../api/types";

export interface ModerationMenuProps {
  threadId: number;
  isPinned?: boolean;
  isLocked?: boolean;
  onAction?: (action: ModerationAction) => void;
}

/**
 * Moderator action menu (AC-26). Rendered only for the moderator and admin
 * roles — the server enforces the role, the client simply does not offer the
 * control (AC-08). Offers Anheften/Angepinnt lösen, Sperren/Entsperren,
 * Verschieben (with a category choice) and Entfernen via
 * POST /api/v1/threads/{id}/moderate.
 */
export function ModerationMenu({
  threadId,
  isPinned = false,
  isLocked = false,
  onAction,
}: ModerationMenuProps) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"move" | "remove" | null>(null);
  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const canModerate = user?.role === "moderator" || user?.role === "admin";

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (dialog !== "move") return;
    let cancelled = false;
    setCategoriesLoading(true);
    setCategoryId(null);
    categoriesApi
      .listCategories({ page: 1, per_page: 100 })
      .then((page) => {
        if (!cancelled) setCategories(page.items);
      })
      .catch(() => {
        if (!cancelled) setError("Kategorien konnten nicht geladen werden.");
      })
      .finally(() => {
        if (!cancelled) setCategoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dialog]);

  if (!canModerate) return null;

  async function runAction(
    action: ModerationAction,
    catId?: number,
  ): Promise<void> {
    if (pending) return;
    setPending(true);
    setError(null);
    const input: ModerateThreadInput = { action };
    if (catId !== undefined) input.category_id = catId;
    try {
      await moderationApi.moderateThread(threadId, input);
      setDialog(null);
      setMenuOpen(false);
      onAction?.(action);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Aktion fehlgeschlagen. Bitte später erneut versuchen.",
      );
    } finally {
      setPending(false);
    }
  }

  function openDialog(next: "move" | "remove"): void {
    setMenuOpen(false);
    setError(null);
    setSubmitted(false);
    setDialog(next);
  }

  function confirmMove(): void {
    setSubmitted(true);
    if (categoryId === null) return;
    void runAction("move", categoryId);
  }

  const moveError = submitted && categoryId === null;

  return (
    <div className="relative inline-flex" ref={containerRef}>
      <button
        type="button"
        className="icon-btn"
        aria-label="Moderationsmenü"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="12" cy="19" r="1.75" />
        </svg>
      </button>

      {menuOpen ? (
        <div
          role="menu"
          aria-label="Moderationsaktionen"
          className="card card-raised absolute right-0 top-[calc(100%+4px)] z-30 p-1"
          style={{ minWidth: 200, borderRadius: "var(--radius-md)" }}
        >
          <button
            type="button"
            role="menuitem"
            className="flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-[14px] hover:bg-bg-subtle"
            onClick={() =>
              void runAction(isPinned ? "unpin" : "pin")
            }
          >
            {isPinned ? "Angepinnt lösen" : "Anheften"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-[14px] hover:bg-bg-subtle"
            onClick={() =>
              void runAction(isLocked ? "unlock" : "lock")
            }
          >
            {isLocked ? "Entsperren" : "Sperren"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-[14px] hover:bg-bg-subtle"
            onClick={() => openDialog("move")}
          >
            Verschieben
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-[14px] hover:bg-bg-subtle"
            style={{ color: "var(--color-danger)" }}
            onClick={() => openDialog("remove")}
          >
            Entfernen
          </button>
        </div>
      ) : null}

      {error && !dialog ? (
        <p
          role="alert"
          className="absolute right-0 top-[calc(100%+4px)] z-30 w-64 rounded-md border px-3 py-2 text-[13px]"
          style={{
            background: "var(--color-danger-soft)",
            borderColor: "var(--color-danger)",
          }}
        >
          {error}
        </p>
      ) : null}

      {dialog ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
          style={{ background: "var(--color-overlay)" }}
          role="presentation"
          onClick={() => {
            if (!pending) setDialog(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="moderation-dialog-title"
            className="card card-raised w-full p-6"
            style={{
              borderRadius: "var(--radius-lg)",
              maxWidth: "min(480px, calc(100vw - 32px))",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="moderation-dialog-title" className="text-[20px] font-semibold">
              {dialog === "move" ? "Thread verschieben" : "Thread entfernen"}
            </h2>

            {dialog === "move" ? (
              <div className="mt-4 flex flex-col gap-3">
                {categoriesLoading ? (
                  <p className="text-[14px] text-fg-muted">
                    Kategorien werden geladen…
                  </p>
                ) : (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="mb-1 text-[14px] font-medium">
                      Zielkategorie
                    </legend>
                    {categories.map((category) => (
                      <label
                        key={category.id}
                        className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border px-3"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        <input
                          type="radio"
                          name="moderation-target-category"
                          value={category.id}
                          checked={categoryId === category.id}
                          onChange={() => setCategoryId(category.id)}
                        />
                        {category.name}
                      </label>
                    ))}
                  </fieldset>
                )}
                {moveError ? (
                  <p role="alert" className="text-[13px]" style={{ color: "var(--color-danger)" }}>
                    Bitte wähle eine Kategorie.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-[15px] text-fg-muted">
                Der Thread wird aus der Liste entfernt. Diese Aktion kann nicht
                rückgängig gemacht werden.
              </p>
            )}

            {error ? (
              <p
                role="alert"
                className="mt-3 rounded-md border px-3 py-2 text-[13px]"
                style={{
                  background: "var(--color-danger-soft)",
                  borderColor: "var(--color-danger)",
                }}
              >
                {error}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={pending}
                onClick={() => setDialog(null)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className={`btn ${dialog === "remove" ? "btn-danger" : "btn-primary"}`}
                disabled={pending}
                onClick={() =>
                  dialog === "move" ? confirmMove() : void runAction("remove")
                }
              >
                {pending
                  ? "Wird ausgeführt…"
                  : dialog === "move"
                    ? "Verschieben"
                    : "Entfernen"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ModerationMenu;
