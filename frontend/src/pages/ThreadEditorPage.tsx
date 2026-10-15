import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { listCategories } from "../api/categories";
import { createThread, getThread, updateThread } from "../api/threads";
import type { CategoryOut } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { MarkdownEditor } from "../components/MarkdownEditor";

type FieldName = "title" | "category" | "body";

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 4,
  color: "var(--color-fg)",
};

const fieldErrorStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: "18px",
  color: "var(--color-danger)",
  marginTop: 4,
  marginBottom: 0,
};

const hintStyle: CSSProperties = {
  fontSize: 13,
  color: "var(--color-fg-muted)",
  marginTop: 4,
  marginBottom: 0,
};

function alertStyle(tone: "error" | "info"): CSSProperties {
  const colour = tone === "error" ? "danger" : "info";
  return {
    padding: "12px 16px",
    borderRadius: "var(--radius-md)",
    border: `1px solid var(--color-${colour})`,
    background: `var(--color-${colour}-soft)`,
    color: "var(--color-fg)",
    fontSize: 14,
  };
}

/** Best-effort read of a retry delay from the shared error envelope. */
function extractRetryAfter(details: unknown): number | null {
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const record = details as Record<string, unknown>;
    for (const key of ["retry_after", "retryAfter"]) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(0, Math.ceil(value));
      }
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) return Math.max(0, Math.ceil(parsed));
      }
    }
  }
  return null;
}

/**
 * Thread create and edit page. It serves both /new and /t/:id/edit and saves
 * through POST /api/v1/threads or PATCH /api/v1/threads/{id}. The Markdown body
 * is edited with the MarkdownEditor and rendered safely client-side for the
 * live preview only — the stored body is always Markdown source, rendered and
 * sanitised by the server.
 */
export function ThreadEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const isEdit = id !== undefined;
  const threadId = isEdit ? Number(id) : null;

  const [categories, setCategories] = useState<CategoryOut[]>([]);
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [body, setBody] = useState("");

  const [touched, setTouched] = useState<Record<FieldName, boolean>>({
    title: false,
    category: false,
    body: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [retryAfter, setRetryAfter] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    listCategories({ per_page: 100 })
      .then((page) => {
        if (!cancelled) setCategories(page.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFormError(
            err instanceof ApiError
              ? err.message
              : "Kategorien konnten nicht geladen werden.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !isEdit || threadId === null || Number.isNaN(threadId)) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    getThread(threadId)
      .then((thread) => {
        if (cancelled) return;
        setTitle(thread.title);
        setBody(thread.body_markdown);
        setTags(thread.tags);
        setCategoryId(String(thread.category.id));
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "Dieser Thread existiert nicht."
            : "Der Thread konnte nicht geladen werden.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isEdit, threadId]);

  const rateLimited = retryAfter > 0;
  useEffect(() => {
    if (!rateLimited) return;
    const timer = window.setInterval(() => {
      setRetryAfter((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [rateLimited]);

  const clientErrors = useMemo(() => {
    const errors: Partial<Record<FieldName, string>> = {};
    if (!title.trim()) errors.title = "Bitte einen Titel angeben.";
    if (!categoryId) errors.category = "Bitte eine Kategorie wählen.";
    if (!body.trim()) errors.body = "Bitte einen Text eingeben.";
    return errors;
  }, [title, categoryId, body]);

  function errorFor(field: FieldName): string | undefined {
    const serverError =
      field === "category"
        ? fieldErrors.category ?? fieldErrors.category_id
        : fieldErrors[field];
    if (serverError) return serverError;
    if (touched[field] || submitted) return clientErrors[field];
    return undefined;
  }

  function clearServerError(field: string): void {
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function addTags(raw: string): void {
    const parts = raw
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    if (parts.length === 0) return;
    setTags((prev) => Array.from(new Set([...prev, ...parts])));
    setTagDraft("");
    clearServerError("tags");
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTags(tagDraft);
    } else if (event.key === "Backspace" && tagDraft === "" && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitted(true);
    setFormError(null);
    if (Object.keys(clientErrors).length > 0 || rateLimited) return;

    setSaving(true);
    try {
      if (isEdit && threadId !== null) {
        const updated = await updateThread(threadId, {
          title: title.trim(),
          body,
          tags,
        });
        navigate(`/t/${updated.id}`);
      } else {
        const created = await createThread({
          category_id: Number(categoryId),
          title: title.trim(),
          body,
          tags,
        });
        navigate(`/t/${created.id}`);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 422) {
          setFieldErrors(err.fieldErrors());
        } else if (err.status === 429) {
          setRetryAfter(extractRetryAfter(err.details) ?? 60);
        } else {
          setFormError(err.message || "Speichern fehlgeschlagen.");
        }
      } else {
        setFormError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      }
    } finally {
      setSaving(false);
    }
  }

  if (authLoading) {
    return (
      <section className="card empty-state" aria-label="Editor wird geladen">
        <p className="empty-state__hint">Lädt…</p>
      </section>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const heading = isEdit ? "Thread bearbeiten" : "Thread erstellen";

  if (loadError) {
    return (
      <section aria-labelledby="thread-editor-title">
        <h1
          id="thread-editor-title"
          style={{ fontSize: 24, marginBottom: "var(--space-4)" }}
        >
          {heading}
        </h1>
        <div style={alertStyle("error")} role="alert">
          {loadError}{" "}
          <Link to="/" style={{ textDecoration: "underline" }}>
            Zur Startseite
          </Link>
        </div>
      </section>
    );
  }

  const titleError = errorFor("title");
  const categoryError = errorFor("category");
  const bodyError = errorFor("body");
  const tagsError = fieldErrors.tags;

  return (
    <section aria-labelledby="thread-editor-title">
      <h1
        id="thread-editor-title"
        style={{ fontSize: 24, marginBottom: "var(--space-4)" }}
      >
        {heading}
      </h1>

      {loading ? (
        <section className="card empty-state" aria-label="Thread wird geladen">
          <p className="empty-state__hint">Der Thread wird geladen…</p>
        </section>
      ) : (
        <form
          className="card"
          noValidate
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-4)",
          }}
        >
          {formError && (
            <div style={alertStyle("error")} role="alert">
              {formError}
            </div>
          )}

          <div>
            <label htmlFor="thread-title" style={labelStyle}>
              Titel
            </label>
            <input
              id="thread-title"
              className="input"
              type="text"
              value={title}
              maxLength={200}
              disabled={saving}
              aria-invalid={titleError ? true : undefined}
              aria-describedby={titleError ? "thread-title-error" : undefined}
              style={
                titleError
                  ? { borderColor: "var(--color-danger)" }
                  : undefined
              }
              onChange={(event) => {
                setTitle(event.target.value);
                clearServerError("title");
              }}
              onBlur={() => setTouched((prev) => ({ ...prev, title: true }))}
            />
            {titleError && (
              <p id="thread-title-error" role="alert" style={fieldErrorStyle}>
                {titleError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="thread-category" style={labelStyle}>
              Kategorie
            </label>
            <select
              id="thread-category"
              className="input"
              value={categoryId}
              disabled={saving || isEdit}
              aria-invalid={categoryError ? true : undefined}
              aria-describedby={
                categoryError ? "thread-category-error" : undefined
              }
              style={
                categoryError
                  ? { borderColor: "var(--color-danger)" }
                  : undefined
              }
              onChange={(event) => {
                setCategoryId(event.target.value);
                setTouched((prev) => ({ ...prev, category: true }));
                clearServerError("category");
              }}
              onBlur={() =>
                setTouched((prev) => ({ ...prev, category: true }))
              }
            >
              <option value="">Kategorie wählen…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {isEdit && (
              <p style={hintStyle}>
                Die Kategorie kann beim Bearbeiten nicht geändert werden.
              </p>
            )}
            {categoryError && (
              <p
                id="thread-category-error"
                role="alert"
                style={fieldErrorStyle}
              >
                {categoryError}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="thread-tags" style={labelStyle}>
              Schlagwörter
            </label>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "var(--space-1)",
                minHeight: 44,
                padding: "6px 10px",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                background: "var(--color-surface)",
              }}
            >
              {tags.map((tag) => (
                <span key={tag} className="badge badge-accent">
                  {tag}
                  <button
                    type="button"
                    aria-label={`Schlagwort ${tag} entfernen`}
                    disabled={saving}
                    onClick={() => {
                      setTags((prev) => prev.filter((item) => item !== tag));
                      clearServerError("tags");
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "inherit",
                      cursor: saving ? "not-allowed" : "pointer",
                      padding: 0,
                      marginLeft: 2,
                      lineHeight: 1,
                      fontSize: 14,
                    }}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                id="thread-tags"
                type="text"
                value={tagDraft}
                disabled={saving}
                placeholder="Schlagwort hinzufügen…"
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={handleTagKeyDown}
                style={{
                  flex: "1 1 120px",
                  minWidth: 120,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "var(--color-fg)",
                  fontSize: 15,
                  padding: 0,
                }}
              />
            </div>
            <p style={hintStyle}>
              Mit Enter oder Komma bestätigen. Bis zu 5 Schlagwörter.
            </p>
            {tagsError && (
              <p role="alert" style={fieldErrorStyle}>
                {tagsError}
              </p>
            )}
          </div>

          <div>
            <span id="thread-body-label" style={labelStyle}>
              Text
            </span>
            <MarkdownEditor
              value={body}
              label="Markdown-Text"
              disabled={saving}
              submitting={saving}
              onChange={(next) => {
                setBody(next);
                clearServerError("body");
              }}
            />
            {bodyError && (
              <p id="thread-body-error" role="alert" style={fieldErrorStyle}>
                {bodyError}
              </p>
            )}
          </div>

          {rateLimited && (
            <div style={alertStyle("error")} role="alert">
              Zu viele Beiträge – erneut in {retryAfter} s
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "var(--space-2)",
              flexWrap: "wrap",
            }}
          >
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || rateLimited}
            >
              {saving
                ? "Wird gespeichert…"
                : isEdit
                  ? "Änderungen speichern"
                  : "Thread erstellen"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={saving}
              onClick={() => navigate(-1)}
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export default ThreadEditorPage;
