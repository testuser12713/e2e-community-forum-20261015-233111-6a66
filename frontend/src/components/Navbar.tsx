import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationBell } from "./NotificationBell";

export function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="app-header">
      <div className="container-forum app-header__inner">
        <Link to="/" className="app-header__brand" aria-label="Forum – Startseite">
          <span className="app-header__mark" aria-hidden="true" />
          <span>Forum</span>
        </Link>

        <nav className="app-header__nav" aria-label="Hauptnavigation">
          <NavLink to="/" end className="nav-link">
            Startseite
          </NavLink>
          <NavLink to="/search" className="nav-link">
            Suche
          </NavLink>
          <NavLink to="/new" className="nav-link">
            Neuer Thread
          </NavLink>
        </nav>

        <div className="app-header__actions">
          <ThemeToggle />
          <NotificationBell />
          {isAuthenticated && user ? (
            <div className="app-header__user">
              <Link
                to={`/u/${user.username}`}
                className="app-header__username"
              >
                {user.display_name || user.username}
              </Link>
              <Link
                to="/settings"
                className="icon-btn app-header__settings"
                aria-label="Einstellungen"
                title="Einstellungen"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </Link>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void logout()}
              >
                Abmelden
              </button>
            </div>
          ) : (
            <div className="app-header__user">
              <Link to="/login" className="nav-link">
                Anmelden
              </Link>
              <Link to="/register" className="btn btn-primary app-header__register">
                Registrieren
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
