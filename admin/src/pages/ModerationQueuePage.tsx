import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listReports, resolveReport } from "../api/admin";
import { ApiError } from "../api/client";
import type { ReportOut, ReportStatus } from "../api/types";

/*
 * Admin moderation queue (AC-27).
 *
 * Lists the reported content from GET /api/v1/moderation/reports for the chosen
 * status (default: open), paged through the shared Page envelope. A moderator
 * either removes the reported content or dismisses the report through
 * POST /api/v1/moderation/reports/{id}/resolve; afterwards the queue is
 * refetched, so the worked entry leaves the open list again. A 403 renders the
 * not-authorised state and any other failure an Alert with the API's message.
 */

const PER_PAGE = 20;

const STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Offen",
  resolved: "Erledigt",
  dismissed: "Verworfen",
};

const STATUS_ORDER: ReportStatus[] = ["open", "resolved", "dismissed"];

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) {
    return "gerade eben";
  }
  if (minutes < 60) {
    return `vor ${minutes} Min.`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `vor ${hours} Std.`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}`;
}

function formatAbsolute(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${date.getFullYear()}, ${hours}:${minutes}`;
}

function contentLabel(report: ReportOut): string {
  const kind = report.content_type === "thread" ? "Thread" : "Kommentar";
  return `${kind} #${report.content_id}`;
}

function authorName(name: string | null | undefined): string {
  return name && name.trim().length > 0 ? name : "Unbekannt";
}

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}

function Pagination({ page, pages, total, onPage }: PaginationProps) {
  const last = Math.max(1, pages);
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
          className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm font-semibold text-fg transition-colors duration-100 hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
        >
          Zurück
        </button>
        <span className="text-sm tabular-nums text-fg-muted">
          {page} / {last}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= last}
          className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-3 text-sm font-semibold text-fg transition-colors duration-100 hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
        >
          Weiter
        </button>
      </div>
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div data-testid="moderation-skeleton" className="flex flex-col gap-4">
      {[0, 1].map((row) => (
        <div
          key={row}
          className="flex animate-pulse flex-col gap-3 rounded-lg border border-border bg-surface p-4"
        >
          <span className="h-3 w-40 rounded-sm bg-bg-subtle" />
          <span className="h-16 w-full rounded-sm bg-bg-subtle" />
          <span className="h-3 w-56 rounded-sm bg-bg-subtle" />
        </div>
      ))}
    </div>
  );
}

function EmptyQueue({ status }: { status: ReportStatus }) {
  return (
    <div
      data-testid="moderation-queue-empty"
      className="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface px-6 py-12 text-center"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="32"
        height="32"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-fg-subtle"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
      <p className="text-base font-semibold text-fg">
        Keine {STATUS_LABEL[status].toLowerCase()}en Meldungen
      </p>
      <p className="max-w-[48ch] text-[13px] text-fg-muted">
        Sobald Nutzer Inhalte melden, erscheinen sie hier zur Prüfung.
      </p>
    </div>
  );
}

function NotAuthorisedState() {
  return (
    <div
      role="alert"
      data-testid="moderation-not-authorised"
      className="rounded-lg border border-danger bg-danger-soft p-4 text-sm text-fg md:p-5"
    >
      <p className="font-semibold">Nicht berechtigt</p>
      <p className="mt-1 text-fg-muted">
        Du hast keine Berechtigung, die Moderations-Warteschlange zu sehen.
        Diese Ansicht ist nur für Moderatoren und Administratoren.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      data-testid="moderation-error"
      className="rounded-lg border border-danger bg-danger-soft p-4 text-sm text-fg md:p-5"
    >
      <p className="font-semibold">
        Meldungen konnten nicht geladen werden
      </p>
      <p className="mt-1 text-fg-muted">{message}</p>
    </div>
  );
}

interface ReportCardProps {
  report: ReportOut;
  pending: boolean;
  onResolve: (report: ReportOut, action: "remove_content" | "dismiss") => void;
}

function ReportCard({ report, pending, onResolve }: ReportCardProps) {
  return (
    <article
      data-testid={`report-row-${report.id}`}
      className={`flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-opacity duration-100 ${
        pending ? "opacity-50" : "opacity-100"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-[15px] font-semibold text-fg">
          Meldung · {report.reason}
        </h2>
        <span className="text-[13px] text-fg-muted">
          {formatTimestamp(report.created_at)}
        </span>
      </div>

      <div className="border-l-[3px] border-warning bg-bg-subtle px-4 py-3">
        <p className="text-[13px] font-medium text-fg-muted">
          Gemeldeter Inhalt
        </p>
        <p
          data-testid={`report-content-${report.id}`}
          className="max-w-[68ch] text-[15px] text-fg"
        >
          {contentLabel(report)}
        </p>
        {report.note && (
          <p className="mt-1 max-w-[68ch] text-[13px] text-fg-muted">
            Notiz: {report.note}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1 text-[13px] text-fg-muted">
        <span data-testid={`report-reporter-${report.id}`}>
          Gemeldet von{" "}
          <span className="font-medium text-fg">
            {authorName(
              report.reporter.display_name || report.reporter.username,
            )}
          </span>
        </span>
        <span>
          Ziel: {report.content_type === "thread" ? "Thread" : "Kommentar"} #
          {report.content_id}
          {report.resolved_at
            ? ` · erledigt am ${formatAbsolute(report.resolved_at)}`
            : ""}
        </span>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => onResolve(report, "remove_content")}
          disabled={pending}
          className="inline-flex h-11 items-center rounded-md border border-danger bg-danger-soft px-4 text-sm font-semibold text-danger transition-colors duration-100 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Inhalt entfernen
        </button>
        <button
          type="button"
          onClick={() => onResolve(report, "dismiss")}
          disabled={pending}
          className="inline-flex h-11 items-center rounded-md border border-border bg-surface px-4 text-sm font-semibold text-fg transition-colors duration-100 hover:border-border-strong hover:bg-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
        >
          Meldung verwerfen
        </button>
      </div>
    </article>
  );
}

export default function ModerationQueuePage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ReportStatus>("open");
  const [page, setPage] = useState(1);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["moderation-reports", status, page],
    queryFn: () => listReports({ status, page, per_page: PER_PAGE }),
  });

  function changeStatus(next: ReportStatus) {
    setStatus(next);
    setPage(1);
  }

  async function handleResolve(
    report: ReportOut,
    action: "remove_content" | "dismiss",
  ): Promise<void> {
    setPendingId(report.id);
    setActionError(null);
    try {
      await resolveReport(report.id, action);
      setToast("Erledigt – Audit-Eintrag geschrieben");
      await queryClient.invalidateQueries({
        queryKey: ["moderation-reports"],
      });
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : "Aktion konnte nicht ausgeführt werden.",
      );
    } finally {
      setPendingId(null);
    }
  }

  const isForbidden = query.error instanceof ApiError && query.error.status === 403;
  const loadError =
    query.error instanceof ApiError
      ? query.error.message
      : query.isError
        ? "Meldungen konnten nicht geladen werden."
        : null;
  const reports = query.data?.items ?? [];

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-fg">Warteschlange</h1>
        <p className="max-w-[68ch] text-sm text-fg-muted">
          Gemeldete Inhalte prüfen und entweder den Inhalt entfernen oder die
          Meldung verwerfen.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_ORDER.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={status === option}
            onClick={() => changeStatus(option)}
            className={
              status === option
                ? "inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-contrast"
                : "inline-flex h-9 items-center rounded-md border border-border bg-surface px-4 text-sm font-semibold text-fg transition-colors duration-100 hover:bg-bg-subtle"
            }
          >
            {STATUS_LABEL[option]}
          </button>
        ))}
      </div>

      {actionError && (
        <div
          role="alert"
          className="rounded-md border border-danger bg-danger-soft px-4 py-3 text-sm text-fg"
        >
          {actionError}
        </div>
      )}

      {query.isLoading ? (
        <QueueSkeleton />
      ) : isForbidden ? (
        <NotAuthorisedState />
      ) : loadError ? (
        <ErrorState message={loadError} />
      ) : reports.length === 0 ? (
        <EmptyQueue status={status} />
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                pending={pendingId === report.id}
                onResolve={(item, action) => void handleResolve(item, action)}
              />
            ))}
          </div>
          {query.data && query.data.pages > 1 && (
            <Pagination
              page={query.data.page}
              pages={query.data.pages}
              total={query.data.total}
              onPage={setPage}
            />
          )}
        </>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-40 flex max-w-[320px] items-center gap-2 rounded-md border border-border bg-surface-raised px-4 py-3 text-sm text-fg shadow-lg"
        >
          <span aria-hidden="true" className="text-success">
            ✓
          </span>
          {toast}
        </div>
      )}
    </section>
  );
}
