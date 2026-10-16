import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import Layout, { EmptyState } from "./components/Layout";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import AuditLogPage from "./pages/AuditLogPage";
import CategoriesPage from "./pages/CategoriesPage";
import DashboardPage from "./pages/DashboardPage";
import ModerationQueuePage from "./pages/ModerationQueuePage";
import UsersPage from "./pages/UsersPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function NotFoundIcon() {
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
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M10.4 12.4a1.6 1.6 0 1 1 2.4 1.7c-.6.4-.8.7-.8 1.3" />
      <path d="M12 17.6h.01" />
    </svg>
  );
}

function NotFoundPage() {
  return (
    <EmptyState
      icon={<NotFoundIcon />}
      title="Seite nicht gefunden"
      hint="Diese Adresse gehört zu keiner Ansicht des Admin-Panels."
      action={
        <Link
          to="/dashboard"
          className="inline-flex min-h-11 items-center rounded-md border border-border bg-surface px-[18px] py-[10px] text-[15px] font-semibold text-fg transition-colors duration-100 hover:border-border-strong hover:bg-bg-subtle"
        >
          Zum Dashboard
        </Link>
      }
    />
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/categories" element={<CategoriesPage />} />
              <Route
                path="/moderation-queue"
                element={<ModerationQueuePage />}
              />
              <Route path="/audit-log" element={<AuditLogPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
