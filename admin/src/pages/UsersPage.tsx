import { useEffect, useState } from "react";
import {
  listAdminUsers,
  setUserRole,
  unbanUser,
  type AdminUserQuery,
} from "../api/admin";
import { ApiError } from "../api/client";
import type { AdminUserOut, Page, Role } from "../api/types";
import BanDialog from "../components/BanDialog";

/* ------------------------------------------------------------------ format */

function formatKarma(value: number): string {
  if (value > 0) {
    return `+${value}`;
  }
  if (value < 0) {
    return `\u2212${Math.abs(value)}`;
  }
  return "0";
}

function formatDate(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}

/* ------------------------------------------------------------------ badges */

const ROLE_LABEL: Record<Role, string> = {
  user: "Nutzer",
  moderator: "Moderator",
  admin: "Admin",
};

function RoleBadge({ role }: { role: Role }) {
  const tone =
    role === "admin"
      ? "border-accent/40 bg-accent-soft text-accent"
      : role === "moderator"
        ? "border-info/40 bg-info-soft text-info"
        : "border-border bg-bg-subtle text-fg-muted";
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium ${tone}`}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

function BanStatus({ user }: { user: AdminUserOut }) {
  if (!user.is_banned) {
    return <span className="text-fg-muted">Aktiv</span>;
  }
  const expiry = formatDate(user.ban_expires_at);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="inline-flex h-6 items-center rounded-full border border-warning/40 bg-warning-soft px-2 text-xs font-medium text-warning">
        Gesperrt
      </span>
      <span className="text-fg-muted">
        Gesperrt: {user.ban_reason ?? "Ohne Grund"}
        {expiry ? ` · bis ${expiry}` : ""}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ dialog */

interface RoleDialogProps {
  open: boolean;
  user: AdminUserOut | null;
  onClose: () => void;
  onSaved: (user: AdminUserOut) => void;
}

function RoleDialog({ open, user, onClose, onSaved }: RoleDialogProps) {
  const [role, setRole] = useState<Role>("user");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && user) {
      setRole(user.role);
      setPending(false);
      setError(null);
    }
  }, [open, user]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !user) {
    return null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const updated = await setUserRole(user!.id, role);
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Rolle konnte nicht geändert werden.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-dialog-title"
        className="w-full max-w-[min(480px,calc(100vw-32px))] rounded-lg border border-border bg-surface-raised p-6 shadow-lg"
      >
        <h2 id="role-dialog-title" className="text-xl font-semibold text-fg">
          Rolle für {user.display_name || user.username} ändern
        </h2>
        <form className="mt-4 flex flex-col gap-4" onSubmit={submit} noValidate>
          <label className="flex flex-col gap-1 text-sm font-medium text-fg">
            Rolle
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
              className="h-11 rounded-md border border-border bg-surface px-3 text-[15px] text-fg"
            >
              <option value="user">Nutzer</option>
              <option value="moderator">Moderator</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          {error && (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center rounded-md border border-border bg-surface px-4 text-sm font-semibold text-fg transition-colors hover:bg-bg-subtle"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Speichern…" : "Speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- paginate */

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  perPage: number;
  onPage: (page: number) => void;
}

function visiblePages(page: number, pages: number): number[] {
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(pages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const result: number[] = [];
  for (let i = start; i <= end; i += 1) {
    result.push(i);
  }
  return result;
}

function Pagination({ page, pages, total, onPage }: PaginationProps) {
  const last = Math.max(1, pages);
  const numbers = visiblePages(page, last);
  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="text-[13px] text-fg-muted">
        Seite {page} von {last} · {total} Einträge
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm font-semibold text-fg transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
        >
          Zurück
        </button>
        {numbers.map((n) => (
          <button
            key={n}
            type="button"
            aria-current={n === page ? "page" : undefined}
            onClick={() => onPage(n)}
            className={
              n === page
                ? "inline-flex h-9 min-w-9 items-center justify-center rounded-md bg-accent px-2 text-sm font-semibold text-accent-contrast"
                : "inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-border bg-surface px-2 text-sm font-semibold text-fg transition-colors hover:bg-bg-subtle"
            }
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= last}
          className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm font-semibold text-fg transition-colors hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
        >
          Weiter
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- page */

export default function UsersPage() {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AdminUserOut> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banTarget, setBanTarget] = useState<AdminUserOut | null>(null);
  const [roleTarget, setRoleTarget] = useState<AdminUserOut | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const params: AdminUserQuery = { page };
    if (query) {
      params.q = query;
    }
    listAdminUsers(params)
      .then((result) => {
        if (active) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Nutzer konnten nicht geladen werden.",
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [query, page]);

  function replaceUser(updated: AdminUserOut) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item) =>
              item.id === updated.id ? updated : item,
            ),
          }
        : prev,
    );
  }

  async function liftBan(user: AdminUserOut) {
    try {
      const updated = await unbanUser(user.id);
      replaceUser(updated);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Entsperren fehlgeschlagen.",
      );
    }
  }

  function search(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(term.trim());
  }

  const items = data?.items ?? [];

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-fg">Nutzer</h1>
        <p className="text-sm text-fg-muted">
          Nutzer suchen, Rollen ändern und Sperren verwalten.
        </p>
      </div>

      <form
        onSubmit={search}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        role="search"
      >
        <label className="sr-only" htmlFor="user-search">
          Nutzer durchsuchen
        </label>
        <input
          id="user-search"
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Nutzername oder E-Mail"
          className="h-11 w-full rounded-full border border-border bg-surface px-4 text-[15px] text-fg placeholder:text-fg-subtle focus:border-accent sm:max-w-[320px]"
        />
        <button
          type="submit"
          className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover"
        >
          Suchen
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-fg"
        >
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="h-10 bg-bg-subtle">
                <th className="px-4 text-xs font-medium uppercase tracking-[0.02em] text-fg-muted">
                  Nutzer
                </th>
                <th className="px-4 text-xs font-medium uppercase tracking-[0.02em] text-fg-muted">
                  E-Mail
                </th>
                <th className="px-4 text-xs font-medium uppercase tracking-[0.02em] text-fg-muted">
                  Rolle
                </th>
                <th className="px-4 text-xs font-medium uppercase tracking-[0.02em] text-fg-muted">
                  Karma
                </th>
                <th className="px-4 text-xs font-medium uppercase tracking-[0.02em] text-fg-muted">
                  Status
                </th>
                <th className="px-4 text-right text-xs font-medium uppercase tracking-[0.02em] text-fg-muted">
                  Aktionen
                </th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 4 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className="h-12 border-t border-border">
                    <td colSpan={6} className="px-4">
                      <span className="block h-4 w-full animate-pulse rounded-sm bg-bg-subtle" />
                    </td>
                  </tr>
                ))}

              {!loading &&
                items.map((user) => (
                  <tr
                    key={user.id}
                    data-testid={`user-row-${user.id}`}
                    className="h-12 border-t border-border transition-colors hover:bg-bg-subtle"
                  >
                    <td className="px-4 text-sm font-medium text-fg">
                      {user.display_name || user.username}
                      <span className="ml-2 text-fg-muted">
                        @{user.username}
                      </span>
                    </td>
                    <td className="px-4 text-sm text-fg">{user.email}</td>
                    <td className="px-4">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-4 text-sm tabular-nums text-fg">
                      {formatKarma(user.karma)}
                    </td>
                    <td className="px-4 text-sm">
                      <BanStatus user={user} />
                    </td>
                    <td className="px-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setRoleTarget(user)}
                          className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm font-semibold text-fg transition-colors hover:bg-bg-subtle"
                        >
                          Rolle ändern
                        </button>
                        {user.is_banned ? (
                          <button
                            type="button"
                            onClick={() => void liftBan(user)}
                            className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm font-semibold text-fg transition-colors hover:bg-bg-subtle"
                          >
                            Sperre aufheben
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setBanTarget(user)}
                            className="inline-flex h-9 items-center rounded-md border border-danger bg-danger-soft px-3 text-sm font-semibold text-danger transition-colors hover:opacity-90"
                          >
                            Sperren
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <p className="text-base font-semibold text-fg">
              {query ? `Keine Treffer für "${query}"` : "Keine Nutzer gefunden"}
            </p>
            <p className="text-[13px] text-fg-muted">
              Passe die Suche an, um andere Nutzer zu finden.
            </p>
          </div>
        )}
      </div>

      {data && items.length > 0 && (
        <Pagination
          page={data.page}
          pages={data.pages}
          total={data.total}
          perPage={data.per_page}
          onPage={setPage}
        />
      )}

      <BanDialog
        open={banTarget !== null}
        user={banTarget}
        onClose={() => setBanTarget(null)}
        onBanned={replaceUser}
      />
      <RoleDialog
        open={roleTarget !== null}
        user={roleTarget}
        onClose={() => setRoleTarget(null)}
        onSaved={replaceUser}
      />
    </section>
  );
}
