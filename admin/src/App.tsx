import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout, { PlaceholderPanel } from "./components/Layout";
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

function NotFoundPage() {
  return (
    <PlaceholderPanel
      title="Seite nicht gefunden"
      hint="Diese Adresse gehört zu keiner Ansicht des Admin-Panels."
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
