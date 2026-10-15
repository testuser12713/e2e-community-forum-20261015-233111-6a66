import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAuditLogs } from "../api/admin";
import { ApiError } from "../api/client";
import type { AuditLogOut, AuditTargetType, Page } from "../api/types";

/*
 * Admin audit log (AC-28).
 *
 * Lists every moderation and admin action from GET /api/v1/admin/audit-logs
 * with its actor, action, target, timestamp and metadata, filterable by actor,
 * action and target type and paginated through the shared Page envelope. A 403
 * renders the not-authorised state; while the first request is in flight a
 * skeleton mirrors the table, an empty result renders the EmptyState and any
 * other failure an Alert carrying the API's message.
 */

/* ------------------------------------------------------------------ format */

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/Berlin",
});

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "–";
  }
  return DATE_TIME_FORMAT.format(date);
}

const TARGET_LABEL: Record<AuditTargetType, string> = {
  thread: "Thread",
  comment: "Kommentar",
  user: "Nutzer",
  category: "Kategorie",
  report: "Meldung",
};

const TARGET_OPTIONS: { value: AuditTargetType; label: string }[] = [
  { value: "thread", label: "Thread" },
  { value: "comment", label: "Kommentar" },
  { value: "user", label: "Nutzer" },
  { value: "category", label: "Kategorie" },
  { value: "report", label: "Meldung" },
];

function formatTarget(entry: AuditLogOut): string {
  const label = TARGET_LABEL[entry.target_type] ?? entry.target_type;
  return entry.target_id != null ? `${label} #${entry.target_id}` : label;
}

function formatActor(entry: AuditLogOut): string {
  if (!entry.actor) {
    return "System";
  }
  return entry.actor.display_name || entry.actor.username;
}

function formatMetadataValue(value: unknown): string {
  if (value === null) {
    return "–";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function MetadataView({
  metadata,
}: {
  metadata: Record<string, unknown>;
}): JSX.Element {
  const entries = Object.entries(metadata ?? {});
  if (entries.length === 0) {
    return <span className="text-fg-subtle">–</span>;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {entries.map(([key, value]) => (
        <li key={key} className="text-[13px] text-fg-muted">
          <span className="font-medium text-fg">{key}:</span>{" "}
          <span className="break-words">{formatMetadataValue(value)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------- states */

function NotAuthorisedState() {
  return (
    <div
      role="alert"
      data-testid="audit-not-authorised"
      className="rounded-lg border border-danger bg-danger-soft p-4 text-sm text-fg md:p-5"
    >
      <p className="font-semibold">Nicht berechtigt</p>
      <p className="mt-1 text-fg-muted">
        Du hast keine Berechtigung, das Audit-Log zu sehen. Diese Ansicht ist nur
        für Administratoren.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      data-testid="audit-error"
      className="rounded-lg border border-danger bg-danger-soft p-4 text-sm text-fg md:p-5"
    >
      <p className="font-semibold">Audit-Einträge konnten nicht geladen werden</p>
      <p className="mt-1 text-fg-muted">{message}</p>
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div
      data-testid="audit-empty"
      className="flex flex-col items-center gap-2 px-6 py-12 text-center"
    >
      <p className="text-base font-semibold text-fg">Keine Audit-Einträge</p>
      <p className="max-w-[48ch] text-[13px] text-fg-muted">
        {filtered
          ? "Keine Aktion passt zu den gewählten Filtern."
          : "Es wurden noch keine Moderations- oder Admin-Aktionen protokolliert."}
      </p>
    </div>
  );
}

function TableSkeleton() {
  return (
    <tbody data-testid="audit-skeleton">
      {Array.from({ length: 5 }).map((_, index) => (
        <tr key={`skeleton-${index}`} className="h-12 border-t border-border">
          <td colSpan={5} className="px-4">
            <span className="block h-4 w-full animate-pulse rounded-sm bg-bg-subtle" />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

/* --------------------------------------------------------------- pagination */

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

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
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

const PER_PAGE = 20;

export default function AuditLogPage() {
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState<AuditTargetType | "">("");
  const [page, setPage] = useState(1);

  const parsedActor = actor.trim() === "" ? undefined : Number(actor.trim());
  const actorId =
    parsedActor !== undefined && Number.isInteger(parsedActor) && parsedActor > 0
      ? parsedActor
      : undefined;
  const trimmedAction = action.trim();

  const { data, isPending, error } = useQuery<Page<AuditLogOut>, ApiError>({
    queryKey: [
      "admin",
      "audit-logs",
      {
        actorId: actorId ?? null,
        action: trimmedAction || null,
        targetType: targetType || null,
        page,
      },
    ],
    queryFn: () =>
      listAuditLogs({
        actor_id: actorId,
        action: trimmedAction || undefined,
        target_type: targetType || undefined,
        page,
        per_page: PER_PAGE,
      }),
  });

  const isForbidden = error instanceof ApiError && error.status === 403;
  const items = data?.items ?? [];
  const filtered =
    actorId !== undefined || trimmedAction !== "" || targetType !== "";

  function onFilterChange(setter: () => void) {
    setter();
    setPage(1);
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-fg">Audit-Log</h1>
        <p className="max-w-[68ch] text-sm text-fg-muted">
          Protokoll aller Moderations- und Admin-Aktionen mit Akteur, Ziel und
          Zeitstempel. Filtere nach Akteur, Aktion und Zieltyp und blättere durch
          die Einträge.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex flex-col gap-1 text-sm font-medium text-fg">
          Akteur-ID
          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={actor}
            onChange={(event) =>
              onFilterChange(() => setActor(event.target.value))
            }
            placeholder="z. B. 3"
            className="h-11 w-full rounded-md border border-border bg-surface px-3 text-[15px] text-fg placeholder:text-fg-subtle focus:border-accent sm:w-32"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-fg">
          Aktion
          <input
            type="search"
            value={action}
            onChange={(event) =>
              onFilterChange(() => setAction(event.target.value))
            }
            placeholder="z. B. thread.pin"
            className="h-11 w-full rounded-md border border-border bg-surface px-3 text-[15px] text-fg placeholder:text-fg-subtle focus:border-accent sm:w-56"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-fg">
          Zieltyp
          <select
            value={targetType}
            onChange={(event) =>
              onFilterChange(() =>
                setTargetType(event.target.value as AuditTargetType | ""),
              )
            }
            className="h-11 w-full rounded-md border border-border bg-surface px-3 text-[15px] text-fg focus:border-accent sm:w-44"
          >
            <option value="">Alle</option>
            {TARGET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isForbidden ? (
        <NotAuthorisedState />
      ) : error ? (
        <ErrorState message={error.message || "Bitte später erneut versuchen."} />
      ) : (
        <>
          <div className="rounded-lg border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead>
                  <tr className="h-10 bg-bg-subtle">
                    <th className="px-4 text-xs font-medium uppercase tracking-[0.02em] text-fg-muted">
                      Zeitpunkt
                    </th>
                    <th className="px-4 text-xs font-medium uppercase tracking-[0.02em] text-fg-muted">
                      Akteur
                    </th>
                    <th className="px-4 text-xs font-medium uppercase tracking-[0.02em] text-fg-muted">
                      Aktion
                    </th>
                    <th className="px-4 text-xs font-medium uppercase tracking-[0.02em] text-fg-muted">
                      Ziel
                    </th>
                    <th className="px-4 text-xs font-medium uppercase tracking-[0.02em] text-fg-muted">
                      Metadaten
                    </th>
                  </tr>
                </thead>

                {isPending ? (
                  <TableSkeleton />
                ) : (
                  <tbody>
                    {items.map((entry) => (
                      <tr
                        key={entry.id}
                        data-testid={`audit-row-${entry.id}`}
                        className="border-t border-border align-top transition-colors hover:bg-bg-subtle"
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-[13px] tabular-nums text-fg-muted">
                          {formatTimestamp(entry.created_at)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-fg">
                          {formatActor(entry)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex h-6 items-center rounded-full border border-border bg-bg-subtle px-2 text-xs font-medium text-fg">
                            {entry.action}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-fg">
                          {formatTarget(entry)}
                        </td>
                        <td className="px-4 py-3">
                          <MetadataView metadata={entry.metadata} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                )}
              </table>
            </div>

            {!isPending && items.length === 0 && (
              <EmptyState filtered={filtered} />
            )}
          </div>

          {data && items.length > 0 && (
            <Pagination
              page={data.page}
              pages={data.pages}
              total={data.total}
              onPage={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}
