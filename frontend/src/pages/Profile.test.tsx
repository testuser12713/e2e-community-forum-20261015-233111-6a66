import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const authMocks = vi.hoisted(() => ({
  setUser: vi.fn(),
  user: {
    id: 1,
    username: "bob",
    display_name: "Bob",
    avatar_url: null,
    email: "bob@example.com",
    role: "user" as const,
    bio: "Kurze Bio.",
    karma: 5,
    is_banned: false,
    ban_reason: null,
    ban_expires_at: null,
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: authMocks.user,
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    setUser: authMocks.setUser,
  }),
}));

vi.mock("../api/users");
vi.mock("../api/auth");

import ProfilePage from "./ProfilePage";
import SettingsPage from "./SettingsPage";
import { getUser, getUserComments, getUserThreads, updateMe } from "../api/users";
import { changePassword } from "../api/auth";
import { ApiError } from "../api/client";
import type {
  CategoryOut,
  CommentSummary,
  Page,
  ThreadSummary,
  UserOut,
  UserProfileOut,
} from "../api/types";

const category: CategoryOut = {
  id: 1,
  name: "Allgemein",
  slug: "allgemein",
  description: null,
  position: 1,
};

const author: UserOut = {
  id: 9,
  username: "alice",
  display_name: "Alice",
  avatar_url: null,
};

const profile: UserProfileOut = {
  id: 9,
  username: "alice",
  display_name: "Alice",
  avatar_url: null,
  bio: "Ich baue Dinge.",
  karma: 42,
  created_at: "2025-01-15T10:00:00Z",
};

const thread: ThreadSummary = {
  id: 7,
  title: "Hallo an alle",
  category,
  author,
  tags: ["hilfe"],
  score: 3,
  comment_count: 1,
  is_pinned: false,
  is_locked: false,
  is_deleted: false,
  created_at: "2026-01-01T10:00:00Z",
  last_activity_at: "2026-01-02T10:00:00Z",
};

const comment: CommentSummary = {
  id: 11,
  thread_id: 7,
  thread_title: "Hallo an alle",
  body_markdown: "Meine Antwort",
  score: 2,
  is_deleted: false,
  created_at: "2026-01-03T10:00:00Z",
};

function page<T>(items: T[]): Page<T> {
  return { items, page: 1, per_page: 20, total: items.length, pages: 1 };
}

function renderProfile(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/u/:username" element={<ProfilePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/login" element={<h1>Anmeldung</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getUserThreads).mockResolvedValue(page([thread]));
  vi.mocked(getUserComments).mockResolvedValue(page([comment]));
});

afterEach(() => {
  cleanup();
});

describe("ProfilePage", () => {
  it("renders bio, karma and both the thread and comment lists", async () => {
    const user = userEvent.setup();
    vi.mocked(getUser).mockResolvedValue(profile);
    renderProfile("/u/alice");

    expect(await screen.findByText("Ich baue Dinge.")).toBeInTheDocument();
    expect(screen.getByText("+42")).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();

    // Threads tab is shown first and lists the user's threads.
    expect(await screen.findByText("Hallo an alle")).toBeInTheDocument();
    expect(getUserThreads).toHaveBeenCalledWith("alice", {
      page: 1,
      per_page: 20,
    });

    // Switching to the comments tab loads the user's comments.
    await user.click(screen.getByRole("tab", { name: "Kommentare" }));
    expect(await screen.findByText("Meine Antwort")).toBeInTheDocument();
    expect(getUserComments).toHaveBeenCalledWith("alice", {
      page: 1,
      per_page: 20,
    });
  });

  it("shows the not-found state for an unknown username", async () => {
    vi.mocked(getUser).mockRejectedValue(
      new ApiError(404, "not_found", "Nutzer nicht gefunden.", null),
    );
    renderProfile("/u/ghost");

    expect(await screen.findByText("Nutzer nicht gefunden")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("SettingsPage", () => {
  it("shows the server's wrong-password error while an untouched form stays neutral", async () => {
    const user = userEvent.setup();
    vi.mocked(changePassword).mockRejectedValue(
      new ApiError(400, "invalid_password", "Passwort falsch.", [
        {
          field: "current_password",
          message: "Das aktuelle Passwort ist falsch.",
        },
      ]),
    );
    renderSettings();

    // Untouched form: no validation feedback at all (AC-44).
    expect(
      screen.queryByText("Das aktuelle Passwort ist falsch."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Aktuelles Passwort"),
      "falschesPasswort",
    );
    await user.type(screen.getByLabelText("Neues Passwort"), "GanzNeu123!abc");
    await user.click(screen.getByRole("button", { name: "Passwort ändern" }));

    expect(
      await screen.findByText("Das aktuelle Passwort ist falsch."),
    ).toBeInTheDocument();
    expect(changePassword).toHaveBeenCalledWith({
      current_password: "falschesPasswort",
      new_password: "GanzNeu123!abc",
    });
  });

  it("confirms a successful password change and keeps the session", async () => {
    const user = userEvent.setup();
    vi.mocked(changePassword).mockResolvedValue(undefined);
    renderSettings();

    await user.type(
      screen.getByLabelText("Aktuelles Passwort"),
      "richtigPasswort1!",
    );
    await user.type(screen.getByLabelText("Neues Passwort"), "GanzNeu123!abc");
    await user.click(screen.getByRole("button", { name: "Passwort ändern" }));

    expect(await screen.findByText(/Passwort geändert/)).toBeInTheDocument();
    // The session is kept: the profile form still shows the signed-in user.
    expect(screen.getByDisplayValue("Bob")).toBeInTheDocument();
  });

  it("saves the profile through PATCH /users/me and updates the session user", async () => {
    const user = userEvent.setup();
    vi.mocked(updateMe).mockResolvedValue({
      ...authMocks.user,
      display_name: "Bob Neu",
      bio: "Neue Bio.",
    });
    renderSettings();

    const nameField = screen.getByLabelText("Anzeigename");
    await user.clear(nameField);
    await user.type(nameField, "Bob Neu");
    await user.click(screen.getByRole("button", { name: "Profil speichern" }));

    await waitFor(() => expect(updateMe).toHaveBeenCalledTimes(1));
    expect(updateMe).toHaveBeenCalledWith({
      display_name: "Bob Neu",
      bio: "Kurze Bio.",
    });
    expect(authMocks.setUser).toHaveBeenCalled();
    expect(await screen.findByText("Profil gespeichert.")).toBeInTheDocument();
  });
});
