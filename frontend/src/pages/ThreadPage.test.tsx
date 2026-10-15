import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const authState = vi.hoisted(() => ({
  user: null as null | import("../api/types").UserMe,
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("../api/threads");
vi.mock("../api/comments");
vi.mock("../api/subscriptions");

import ThreadPage from "./ThreadPage";
import { getThread } from "../api/threads";
import { listComments } from "../api/comments";
import { getSubscription } from "../api/subscriptions";
import { ApiError } from "../api/client";
import type {
  CategoryOut,
  Page,
  ThreadDetail,
  UserMe,
  UserOut,
} from "../api/types";

const author: UserOut = {
  id: 9,
  username: "bob",
  display_name: "Bob",
  avatar_url: null,
};

const category: CategoryOut = {
  id: 1,
  name: "Allgemein",
  slug: "allgemein",
  description: null,
  position: 1,
};

function makeUser(overrides: Partial<UserMe> = {}): UserMe {
  return {
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
    ...overrides,
  };
}

const now = "2026-01-01T10:00:00Z";

function makeThread(overrides: Partial<ThreadDetail> = {}): ThreadDetail {
  return {
    id: 5,
    title: "Ein Thread",
    category,
    author,
    tags: ["hilfe", "markdown"],
    score: 3,
    comment_count: 2,
    is_pinned: false,
    is_locked: false,
    is_deleted: false,
    created_at: now,
    last_activity_at: now,
    body_markdown: "**Hallo** Welt",
    body_html: "<p><strong>Hallo</strong> Welt</p>",
    edited_at: null,
    my_vote: 0,
    subscribed: false,
    ...overrides,
  };
}

const emptyComments: Page<never> = {
  items: [],
  page: 1,
  per_page: 50,
  total: 0,
  pages: 0,
};

function renderThread(id = 5) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/t/${id}`]}>
        <Routes>
          <Route path="/t/:id" element={<ThreadPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.user = makeUser();
  vi.mocked(listComments).mockResolvedValue(emptyComments);
  vi.mocked(getSubscription).mockResolvedValue({ subscribed: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThreadPage", () => {
  it("renders the thread header with its sanitised body", async () => {
    vi.mocked(getThread).mockResolvedValue(makeThread());

    renderThread();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ein Thread" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Allgemein" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Bob" }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("#hilfe")).toBeInTheDocument();
    expect(screen.getByText("Kommentare: 2")).toBeInTheDocument();

    // The sanitised HTML is rendered, the raw Markdown source is not.
    expect(screen.getByText("Welt")).toBeInTheDocument();
    expect(document.querySelector(".markdown-body strong")).toHaveTextContent(
      "Hallo",
    );
    expect(screen.queryByText("**Hallo** Welt")).not.toBeInTheDocument();
  });

  it("shows hostile input as literal text, never as an executable element", async () => {
    vi.mocked(getThread).mockResolvedValue(
      makeThread({
        body_markdown: "<script>alert(1)</script>",
        // What the sanitising server returns: the tags escaped to text.
        body_html: "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
      }),
    );

    const { container } = renderThread();

    await screen.findByRole("heading", { level: 1, name: "Ein Thread" });
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
  });

  it("marks an edited thread and shows the deleted state", async () => {
    vi.mocked(getThread).mockResolvedValue(
      makeThread({ edited_at: "2026-01-02T12:00:00Z" }),
    );

    const edited = renderThread();
    expect(await screen.findByText("Bearbeitet")).toBeInTheDocument();
    edited.unmount();

    vi.mocked(getThread).mockResolvedValue(
      makeThread({ is_deleted: true, body_html: "[gelöscht]" }),
    );
    renderThread();

    expect(await screen.findByText("[gelöscht]")).toBeInTheDocument();
    expect(screen.getByText("Entfernt")).toBeInTheDocument();
  });

  it("shows 'Gesperrt' for a locked thread", async () => {
    vi.mocked(getThread).mockResolvedValue(makeThread({ is_locked: true }));

    renderThread();

    expect(await screen.findByText("Gesperrt")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Dieser Thread ist gesperrt. Neue Kommentare sind nicht möglich.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the not-found state for a missing thread", async () => {
    vi.mocked(getThread).mockRejectedValue(
      new ApiError(404, "not_found", "Thread nicht gefunden"),
    );

    renderThread(999);

    expect(await screen.findByText("Thread nicht gefunden")).toBeInTheDocument();
  });

  it("surfaces a ban notice and disables the write controls", async () => {
    authState.user = makeUser({
      is_banned: true,
      ban_reason: "Spam",
      ban_expires_at: "2026-03-14T00:00:00Z",
    });
    vi.mocked(getThread).mockResolvedValue(makeThread());

    renderThread();

    expect(await screen.findByText(/Gesperrt: Spam/)).toBeInTheDocument();
    expect(screen.getByText(/bis 14\.03\.2026/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abonnieren" })).toBeDisabled();
  });
});
