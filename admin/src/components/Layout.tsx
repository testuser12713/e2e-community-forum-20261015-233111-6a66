import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import Navbar from "./Navbar";

interface NavItem {
  to: string;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/users", label: "Nutzer" },
  { to: "/categories", label: "Kategorien" },
  { to: "/moderation-queue", label: "Warteschlange" },
  { to: "/audit-log", label: "Audit-Log" },
];

function navLinkClass({ isActive }: { isActive: boolean }): string {
  const base =
    "inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors duration-100";
  return isActive
    ? `${base} bg-accent-soft text-accent`
    : `${base} text-fg-muted hover:bg-bg-subtle hover:text-fg`;
}

function NavLinks() {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} className={navLinkClass}>
          {item.label}
        </NavLink>
      ))}
    </>
  );
}

/**
 * Shared placeholder panel for pages another ticket still owes.
 * It is not tappable and never pretends to be an action.
 */
export function PlaceholderPanel({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <section
      data-testid="placeholder-panel"
      className="rounded-lg border border-border bg-surface p-6 md:p-8"
    >
      <div className="flex flex-col items-start gap-3">
        <h1 className="text-2xl font-semibold text-fg">{title}</h1>
        <span className="inline-flex h-6 items-center rounded-full border border-dashed border-border-strong px-2 text-xs font-medium text-fg-muted">
          In Arbeit
        </span>
        <p className="max-w-[68ch] text-sm text-fg-muted">
          {hint ??
            "Diese Ansicht wird in einem späteren Schritt umgesetzt. Bis dahin steht hier bewusst nur ein Platzhalter."}
        </p>
      </div>
    </section>
  );
}

/** Default 32px line icon for an empty state — a calm, neutral inbox. */
function EmptyStateIcon() {
  return (
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
    >
      <path d="M3 12h4l2 3h6l2-3h4" />
      <path d="M5.5 4.5h13l2.5 7.5v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" />
    </svg>
  );
}

/**
 * DESIGN.md EmptyState: centred block, padding 48px 24px (px-6 py-12), a 32px
 * line icon in fg-subtle, title 16px/600, hint 13px fg-muted (max 2 lines) and
 * an optional secondary action. Used for empty lists, empty search results and
 * out-of-range pages — a page state, never a disabled control.
 */
export function EmptyState({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      data-testid="empty-state"
      className="flex flex-col items-center gap-3 px-6 py-12 text-center"
    >
      <span data-testid="empty-state-icon" className="text-fg-subtle">
        {icon ?? <EmptyStateIcon />}
      </span>
      <h1 className="text-base font-semibold text-fg">{title}</h1>
      {hint ? (
        <p className="line-clamp-2 max-w-[48ch] text-[13px] text-fg-muted">
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <Navbar />
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col lg:flex-row">
        <aside className="hidden w-60 shrink-0 border-r border-border p-3 lg:block">
          <nav
            aria-label="Hauptnavigation"
            className="flex flex-col gap-1"
          >
            <NavLinks />
          </nav>
        </aside>

        <main className="min-w-0 flex-1 px-3 py-4 md:px-6 md:py-6">
          <nav
            aria-label="Hauptnavigation"
            className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <NavLinks />
          </nav>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
