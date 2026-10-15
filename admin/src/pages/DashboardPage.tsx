import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getAdminStats } from "../api/admin";
import { ApiError } from "../api/client";
import type { AdminStats } from "../api/types";

/*
 * Admin dashboard (AC-29).
 *
 * Shows the six headline figures of GET /api/v1/admin/stats, each with its
 * German label, in a StatCard grid (DESIGN.md). While the request is in flight
 * a skeleton mirrors the card layout; a 403 renders the not-authorised state
 * and any other failure renders an Alert carrying the API's message, so the
 * page never stays blank. The open-reports card links to the moderation queue.
 */

const numberFormat = new Intl.NumberFormat("de-DE");

interface StatDef {
  key: keyof AdminStats;
  label: string;
  to?: string;
}

const STATS: StatDef[] = [
  { key: "total_users", label: "Nutzer gesamt" },
  { key: "new_users_7d", label: "Neu in 7 Tagen" },
  { key: "total_threads", label: "Threads" },
  { key: "comments_today", label: "Kommentare heute" },
  { key: "comments_7d", label: "Kommentare in 7 Tagen" },
  { key: "open_reports", label: "Offene Meldungen", to: "/moderation-queue" },
];

const cardClass =
  "flex min-w-[200px] flex-col rounded-lg border border-border bg-surface p-5";

function StatCard({
  label,
  value,
  to,
}: {
  label: string;
  value: number;
  to?: string;
}) {
  const body = (
    <>
      <span className="text-[13px] leading-[18px] text-fg-muted">
        {label}
      </span>
      <span className="mt-1 text-[28px] font-semibold leading-none tabular-nums text-fg">
        {numberFormat.format(value)}
      </span>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className={`${cardClass} transition-colors duration-100 hover:border-border-strong hover:bg-bg-subtle`}
      >
        {body}
      </Link>
    );
  }

  return <div className={cardClass}>{body}</div>;
}

function StatGridSkeleton() {
  return (
    <div
      role="status"
      aria-label="Kennzahlen werden geladen"
      className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4"
    >
      {STATS.map((stat) => (
        <div key={stat.key} className={cardClass} aria-hidden="true">
          <span className="h-3 w-24 animate-pulse rounded-sm bg-bg-subtle" />
          <span className="mt-3 h-7 w-16 animate-pulse rounded-sm bg-bg-subtle" />
        </div>
      ))}
    </div>
  );
}

function NotAuthorisedState() {
  return (
    <div
      role="alert"
      data-testid="dashboard-not-authorised"
      className="rounded-lg border border-danger bg-danger-soft p-4 text-sm text-fg md:p-5"
    >
      <p className="font-semibold">Nicht berechtigt</p>
      <p className="mt-1 text-fg-muted">
        Du hast keine Berechtigung, das Dashboard zu sehen. Diese Ansicht ist
        nur für Administratoren.
      </p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      data-testid="dashboard-error"
      className="rounded-lg border border-danger bg-danger-soft p-4 text-sm text-fg md:p-5"
    >
      <p className="font-semibold">Kennzahlen konnten nicht geladen werden</p>
      <p className="mt-1 text-fg-muted">{message}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { data, isPending, error } = useQuery<AdminStats, ApiError>({
    queryKey: ["admin", "stats"],
    queryFn: getAdminStats,
  });

  const isForbidden = error instanceof ApiError && error.status === 403;

  return (
    <section className="flex flex-col gap-4 md:gap-6">
      <h1 className="text-2xl font-semibold text-fg">Dashboard</h1>

      {isPending ? (
        <StatGridSkeleton />
      ) : isForbidden ? (
        <NotAuthorisedState />
      ) : error ? (
        <ErrorState
          message={error.message || "Bitte später erneut versuchen."}
        />
      ) : data ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          {STATS.map((stat) => (
            <StatCard
              key={stat.key}
              label={stat.label}
              value={data[stat.key]}
              to={stat.to}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
