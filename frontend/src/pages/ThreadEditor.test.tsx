import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: "alice",
      display_name: "Alice",
      avatar_url: null,
      email: "alice@example.com",
      role: "user",
      bio: null,
      karma: 0,
      is_banned: false,
      ban_reason: null,
      ban_expires_at: null,
    },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  }),
}));

vi.mock("../api/categories");
vi.mock("../api/threads");

import ThreadEditorPage from "./ThreadEditorPage";
import { listCategories } from "../api/categories";
import { createThread, getThread, updateThread } from "../api/threads";
import { ApiError } from "../api/client";
import type { CategoryOut, Page, ThreadDetail, UserOut } from "../api/types";

const author: UserOut = {
  id: 1,
  username: "alice",
  display_name: "Alice",
  avatar_url: null,
};

const categories: CategoryOut[] = [
  { id: 1, name: "Allgemein", slug: "allgemein", description: null, position: 1 },
  { id: 2, name: "Technik", slug: "technik", description: null, position: 2 },
];

const categoryPage: Page<CategoryOut> = {
  items: categories,
  page: 1,
  per_page: 100,
  total: categories.length,
  pages: 1,
};

const threadDetail: ThreadDetail = {
  id: 5,
  title: "Alter Titel",
  category: categories[1],
  author,
  tags: ["markdown", "test"],
  score: 3,
  comment_count: 2,
  is_pinned: false,
  is_locked: false,
  is_deleted: false,
  created_at: "2026-01-01T10:00:00Z",
  last_activity_at: "2026-01-02T10:00:00Z",
  body_markdown: "**Alt**",
  body_html: "<p><strong>Alt</strong></p>",
  edited_at: null,
  my_vote: 0,
  subscribed: false,
};

function renderEditor(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/new" element={<ThreadEditorPage />} />
        <Route path="/t/:id/edit" element={<ThreadEditorPage />} />
        <Route path="/t/:id" element={<h1>Thread-Detailseite</h1>} />
        <Route path="/login" element={<h1>Anmeldung</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listCategories).mockResolvedValue(categoryPage);
});

afterEach(() => {
  cleanup();
});

describe("ThreadEditorPage", () => {
  it("posts the form and navigates to the new thread", async () => {
    const user = userEvent.setup();
    vi.mocked(createThread).mockResolvedValue({ ...threadDetail, id: 42 });
    renderEditor("/new");

    await screen.findByRole("option", { name: "Allgemein" });

    await user.type(screen.getByLabelText("Titel"), "Mein Thread");
    await user.selectOptions(screen.getByLabelText("Kategorie"), "1");
    await user.type(screen.getByLabelText("Markdown-Text"), "# Hallo");
    await user.type(screen.getByLabelText("Schlagwörter"), "hilfe{Enter}");

    await user.click(
      screen.getByRole("button", { name: "Thread erstellen" }),
    );

    await waitFor(() => expect(createThread).toHaveBeenCalledTimes(1));
    expect(createThread).toHaveBeenCalledWith({
      category_id: 1,
      title: "Mein Thread",
      body: "# Hallo",
      tags: ["hilfe"],
    });
    expect(await screen.findByText("Thread-Detailseite")).toBeInTheDocument();
  });

  it("pre-fills the values when editing an existing thread", async () => {
    vi.mocked(getThread).mockResolvedValue(threadDetail);
    renderEditor("/t/5/edit");

    expect(await screen.findByDisplayValue("Alter Titel")).toBeInTheDocument();
    expect(screen.getByLabelText("Markdown-Text")).toHaveValue("**Alt**");
    expect(screen.getByLabelText("Kategorie")).toHaveValue("2");
    expect(screen.getByText("markdown")).toBeInTheDocument();
    expect(screen.getByText("test")).toBeInTheDocument();
    expect(getThread).toHaveBeenCalledWith(5);
  });

  it("updates the live preview while typing", async () => {
    const user = userEvent.setup();
    renderEditor("/new");
    await screen.findByRole("option", { name: "Allgemein" });

    await user.type(screen.getByLabelText("Markdown-Text"), "# Überschrift");
    await user.click(screen.getByRole("tab", { name: "Vorschau" }));
    expect(
      screen.getByRole("heading", { level: 1, name: "Überschrift" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Schreiben" }));
    await user.clear(screen.getByLabelText("Markdown-Text"));
    await user.type(screen.getByLabelText("Markdown-Text"), "`code`");
    await user.click(screen.getByRole("tab", { name: "Vorschau" }));
    expect(screen.getByText("code", { selector: "code" })).toBeInTheDocument();
  });

  it("shows field-level messages from a 422 only after submitting", async () => {
    const user = userEvent.setup();
    vi.mocked(createThread).mockRejectedValue(
      new ApiError(422, "validation_error", "Validierungsfehler", [
        { field: "title", message: "Titel zu kurz." },
        { field: "body", message: "Text erforderlich." },
      ]),
    );
    renderEditor("/new");
    await screen.findByRole("option", { name: "Allgemein" });

    await user.type(screen.getByLabelText("Titel"), "Hi");
    await user.selectOptions(screen.getByLabelText("Kategorie"), "1");
    await user.type(screen.getByLabelText("Markdown-Text"), "Text");

    expect(screen.queryByText("Titel zu kurz.")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Thread erstellen" }),
    );

    expect(await screen.findByText("Titel zu kurz.")).toBeInTheDocument();
    expect(screen.getByText("Text erforderlich.")).toBeInTheDocument();
  });

  it("saves an edit through PATCH and navigates to the detail page", async () => {
    const user = userEvent.setup();
    vi.mocked(getThread).mockResolvedValue(threadDetail);
    vi.mocked(updateThread).mockResolvedValue({
      ...threadDetail,
      title: "Neuer Titel",
      edited_at: "2026-01-03T10:00:00Z",
    });
    renderEditor("/t/5/edit");

    const titleField = await screen.findByDisplayValue("Alter Titel");
    await user.clear(titleField);
    await user.type(titleField, "Neuer Titel");
    await user.click(
      screen.getByRole("button", { name: "Änderungen speichern" }),
    );

    await waitFor(() => expect(updateThread).toHaveBeenCalledTimes(1));
    expect(updateThread).toHaveBeenCalledWith(5, {
      title: "Neuer Titel",
      body: "**Alt**",
      tags: ["markdown", "test"],
    });
    expect(await screen.findByText("Thread-Detailseite")).toBeInTheDocument();
  });
});
