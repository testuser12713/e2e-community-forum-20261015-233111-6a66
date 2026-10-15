import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";

export default function Navbar() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-surface">
      <div className="mx-auto flex h-full max-w-[1440px] items-center justify-between gap-3 px-3 md:px-6">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 text-fg"
          aria-label="Forum Admin Startseite"
        >
          <span
            aria-hidden="true"
            className="inline-block h-5 w-5 rounded-[5px] bg-accent"
          />
          <span className="text-[15px] font-semibold tracking-tight">
            Forum · Admin
          </span>
          <span className="inline-flex h-6 items-center rounded-full border border-danger/40 bg-danger-soft px-2 text-xs font-medium text-danger">
            Admin
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <span className="hidden text-sm text-fg-muted sm:inline">
            {user ? user.display_name || user.username : "Nicht angemeldet"}
          </span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
