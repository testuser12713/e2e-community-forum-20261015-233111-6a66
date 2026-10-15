import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import type { CategoryOut, CategoryWrite } from "../api/types";

interface CategoryFormProps {
  initial?: CategoryOut | null;
  onSubmit: (payload: CategoryWrite) => Promise<void> | void;
  onCancel?: () => void;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function CategoryForm({
  initial = null,
  onSubmit,
  onCancel,
}: CategoryFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [position, setPosition] = useState(String(initial?.position ?? 0));
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setName(initial?.name ?? "");
    setSlug(initial?.slug ?? "");
    setDescription(initial?.description ?? "");
    setPosition(String(initial?.position ?? 0));
    setSlugTouched(Boolean(initial));
    setSubmitted(false);
    setError(null);
    setFieldErrors({});
  }, [initial]);

  const nameMissing = submitted && name.trim().length === 0;
  const effectiveSlug = slugTouched ? slug : slugify(name);
  const slugMissing = submitted && effectiveSlug.length === 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setError(null);
    setFieldErrors({});
    if (name.trim().length === 0 || effectiveSlug.length === 0) {
      return;
    }
    setPending(true);
    try {
      await onSubmit({
        name: name.trim(),
        slug: effectiveSlug,
        description: description.trim() === "" ? null : description.trim(),
        position: Number.isFinite(Number(position)) ? Number(position) : 0,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const details = Array.isArray(err.details) ? err.details : [];
        const mapped: Record<string, string> = {};
        for (const detail of details) {
          if (detail && typeof detail.field === "string") {
            mapped[detail.field] = detail.message;
          }
        }
        setFieldErrors(mapped);
        setError(Object.keys(mapped).length > 0 ? null : err.message);
      } else {
        setError("Speichern der Kategorie fehlgeschlagen.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <label className="flex flex-col gap-1 text-sm font-medium text-fg">
        Name
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-11 rounded-md border border-border bg-surface px-3 text-[15px] text-fg"
        />
        {(nameMissing || fieldErrors.name) && (
          <span role="alert" className="text-[13px] text-danger">
            {fieldErrors.name ?? "Bitte einen Namen angeben."}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-fg">
        Slug
        <input
          type="text"
          value={slugTouched ? slug : effectiveSlug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(event.target.value);
          }}
          className="h-11 rounded-md border border-border bg-surface px-3 text-[15px] text-fg"
        />
        {(slugMissing || fieldErrors.slug) && (
          <span role="alert" className="text-[13px] text-danger">
            {fieldErrors.slug ?? "Bitte einen Slug angeben."}
          </span>
        )}
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-fg">
        Beschreibung
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="min-h-[120px] rounded-md border border-border bg-surface px-3 py-2 text-[15px] text-fg"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium text-fg">
        Position
        <input
          type="number"
          value={position}
          onChange={(event) => setPosition(event.target.value)}
          className="h-11 w-32 rounded-md border border-border bg-surface px-3 text-[15px] text-fg"
        />
      </label>

      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center rounded-md border border-border bg-surface px-4 text-sm font-semibold text-fg hover:bg-bg-subtle"
          >
            Abbrechen
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Speichern…" : "Speichern"}
        </button>
      </div>
    </form>
  );
}
