import { useMemo } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { Placeholder } from "./components/Placeholder";
import HomePage from "./pages/HomePage";
import CategoryPage from "./pages/CategoryPage";
import ThreadPage from "./pages/ThreadPage";
import ThreadEditorPage from "./pages/ThreadEditorPage";
import SearchPage from "./pages/SearchPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import NotificationsPage from "./pages/NotificationsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";

/**
 * The complete route table of the forum. It is owned by this skeleton and is
 * not edited by feature tickets — they fill the page files it points at.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/c/:slug" element={<CategoryPage />} />
        <Route path="/t/:id" element={<ThreadPage />} />
        <Route path="/new" element={<ThreadEditorPage />} />
        <Route path="/t/:id/edit" element={<ThreadEditorPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/u/:username" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route
          path="*"
          element={<Placeholder title="Seite nicht gefunden" hint="Diese Adresse existiert nicht." />}
        />
      </Route>
    </Routes>
  );
}

export function App() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
