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
