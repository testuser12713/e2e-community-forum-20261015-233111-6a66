import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

import HomePage from "./HomePage";
import CategoryPage from "./CategoryPage";
import type { CategoryOut, ThreadSummary, UserOut } from "../api/types";

const categoryAllgemein: CategoryOut = {
  id: 1,
  name: "Allgemein",
  slug: "allgemein",
  description: null,
  position: 1,
};

const categoryTechnik: CategoryOut = {
  id: 2,
  name: "Technik",
  slug: "technik",
  description: null,
  position: 2,
};

const author: UserOut = {
  id: 9,
  username: "alice",
  display_name: "Alice",
  avatar_url: null,
};

function makeThread(
  overrides: Partial<ThreadSummary> & { id: number; title: string },
): ThreadSummary {
  const now = new Date().toISOString();
  return {
    category: categoryAllgemein,
    author,
    tags: [],
    score: 0,
    comment_count: 0,
    is_pinned: false,
    is_locked: false,
    is_deleted: false,
    created_at: now,
    last_activity_at: now,
    ...overrides,
  };
}

const threadNew = makeThread({
  id: 1,
  title: "Thread Neu 1",
  score: 5,
  comment_count: 3,
  tags: ["hilfe"],
});

const threadTop = makeThread({ id: 2, title: "Thread Top 1", score: 42 });
const threadHot = makeThread({ id: 3, title: "Thread Hot 1", score: 7 });
const threadPage2 = makeThread({ id: 4, title: "Thread Seite 2" });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function page(items: ThreadSummary[], page: number, total: number, pages: number) {
  return { items, page, per_page: 20, total, pages };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/v1/categories") {
      return jsonResponse({
        items: [categoryAllgemein, categoryTechnik],
        page: 1,
        per_page: 100,
        total: 2,
        pages: 1,
      });
    }
    if (url.pathname === "/api/v1/categories/allgemein") {
      return jsonResponse(categoryAllgemein);
    }
    if (url.pathname === "/api/v1/threads") {
      const sort = url.searchParams.get("sort") ?? "new";
      const pageNumber = Number(url.searchParams.get("page") ?? "1");
      const category = url.searchParams.get("category");

      if (category === "allgemein") {
        return jsonResponse(page([threadNew], 1, 1, 1));
      }
      if (pageNumber >= 3) {
        return jsonResponse(page([], pageNumber, 21, 2));
      }
      if (pageNumber === 2) {
        return jsonResponse(page([threadPage2], 2, 21, 2));
      }
      if (sort === "top") return jsonResponse(page([threadTop], 1, 1, 1));
      if (sort === "hot") return jsonResponse(page([threadHot], 1, 1, 1));
      return jsonResponse(page([threadNew], 1, 21, 2));
    }
    return jsonResponse(
      { error: { code: "not_found", message: "not found", details: null } },
      404,
    );
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderAt(path: string, element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={element} />
          <Route path="/c/:slug" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function calledUrls(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

describe("forum feed", () => {
  it("renders the thread list with score, comment count and category", async () => {
    renderAt("/", <HomePage />);

    expect(await screen.findByText("Thread Neu 1")).toBeInTheDocument();
    expect(screen.getByText("Kommentare: 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Punktzahl: 5")).toBeInTheDocument();

    const meta = screen.getByText("Thread Neu 1").closest("li");
    expect(meta).not.toBeNull();
    expect(
      within(meta as HTMLElement).getByRole("link", { name: "Allgemein" }),
    ).toHaveAttribute("href", "/c/allgemein");
  });

  it("switching the sort re-queries the feed", async () => {
    const user = userEvent.setup();
    renderAt("/", <HomePage />);

    await screen.findByText("Thread Neu 1");
    await user.click(screen.getByRole("tab", { name: "Top" }));

    expect(await screen.findByText("Thread Top 1")).toBeInTheDocument();
    expect(screen.queryByText("Thread Neu 1")).not.toBeInTheDocument();
    expect(calledUrls().some((url) => url.includes("sort=top"))).toBe(true);
  });

  it("paging advances to the next page and back", async () => {
    const user = userEvent.setup();
    renderAt("/", <HomePage />);

    await screen.findByText("Thread Neu 1");
    await user.click(screen.getByRole("button", { name: "Weiter" }));

    expect(await screen.findByText("Thread Seite 2")).toBeInTheDocument();
    expect(calledUrls().some((url) => url.includes("page=2"))).toBe(true);
    expect(
      screen.getByText(/Seite 2 von 2 · 21 Einträge/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Zurück" }));
    expect(await screen.findByText("Thread Neu 1")).toBeInTheDocument();
  });

  it("shows the empty state on a page beyond the last, not an error", async () => {
    renderAt("/?page=3", <HomePage />);

    expect(
      await screen.findByText("Keine Einträge auf dieser Seite"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("filters by a tag chip and clears the filter again", async () => {
    const user = userEvent.setup();
    renderAt("/", <HomePage />);

    await screen.findByText("Thread Neu 1");
    await user.click(screen.getByRole("button", { name: "#hilfe" }));

    expect(await screen.findByText("Tag: #hilfe")).toBeInTheDocument();
    expect(calledUrls().some((url) => url.includes("tag=hilfe"))).toBe(true);

    await user.click(
      screen.getByRole("button", { name: /Filter „hilfe“ entfernen/ }),
    );
    expect(screen.queryByText("Tag: #hilfe")).not.toBeInTheDocument();
  });

  it("keeps every visible control working or visibly disabled", async () => {
    renderAt("/", <HomePage />);

    await screen.findByText("Thread Neu 1");

    // The sort tabs report their selection.
    expect(screen.getByRole("tab", { name: "Neu" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Top" })).toHaveAttribute(
      "aria-selected",
      "false",
    );

    // At the first page the back control is disabled at the ends.
    expect(screen.getByRole("button", { name: "Zurück" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Weiter" })).toBeEnabled();

    // Every thread row carries the always-visible vote control around its
    // score, so a user always sees the way to vote.
    expect(screen.getByLabelText("Punktzahl: 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hochstimmen" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Runterstimmen" }),
    ).toBeInTheDocument();

    // Category navigation is real links.
    expect(screen.getByRole("link", { name: "Technik" })).toHaveAttribute(
      "href",
      "/c/technik",
    );
  });
});

describe("category feed", () => {
  it("queries the threads of the category and shows its name", async () => {
    renderAt("/c/allgemein", <CategoryPage />);

    expect(
      await screen.findByRole("heading", { name: "Kategorie: Allgemein" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Thread Neu 1")).toBeInTheDocument();
    expect(
      calledUrls().some((url) => url.includes("category=allgemein")),
    ).toBe(true);
  });
});
