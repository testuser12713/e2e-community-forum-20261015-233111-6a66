import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import SearchPage from "./SearchPage";
import type { CategoryOut, Page, ThreadSummary } from "../api/types";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function page<T>(items: T[]): Page<T> {
  return { items, page: 1, per_page: 20, total: items.length, pages: 1 };
}

const categories: CategoryOut[] = [
  { id: 1, name: "Hilfe", slug: "hilfe", description: null, position: 1 },
  {
    id: 2,
    name: "Allgemein",
    slug: "allgemein",
    description: null,
    position: 2,
  },
];

function makeThread(
  id: number,
  title: string,
  categorySlug: string,
): ThreadSummary {
  const category = categories.find((item) => item.slug === categorySlug);
  if (!category) throw new Error(`unknown category ${categorySlug}`);
  return {
    id,
    title,
    category,
    author: { id: 9, username: "bob", display_name: "Bob", avatar_url: null },
    tags: ["react"],
    score: 3,
    comment_count: 1,
    is_pinned: false,
    is_locked: false,
    is_deleted: false,
    created_at: "2026-10-01T10:00:00Z",
    last_activity_at: "2026-10-01T10:00:00Z",
  };
}

const withHits = [makeThread(1, "React Hooks erklärt", "hilfe"), makeThread(2, "React Router Tipps", "allgemein")];

/**
 * The search endpoint answers two hits for the term 'react', one when the
 * category filter narrows it to 'hilfe', and nothing for any other term.
 */
function stubFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/v1/categories")) {
      return jsonResponse(200, page(categories));
    }
    if (url.includes("/api/v1/search")) {
      const parsed = new URL(url, "http://localhost");
      const q = parsed.searchParams.get("q");
      const category = parsed.searchParams.get("category");
      if (q !== "react") return jsonResponse(200, page<ThreadSummary>([]));
      return jsonResponse(
        200,
        page(category === "hilfe" ? [withHits[0]] : withHits),
      );
    }
    return jsonResponse(404, {
      error: { code: "not_found", message: "not found", details: null },
    });
  });
}

function renderSearch(initialPath = "/search") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <SearchPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SearchPage", () => {
  it("shows the hits after a query is typed", async () => {
    vi.stubGlobal("fetch", stubFetch());
    const user = userEvent.setup();

    renderSearch();
    await user.type(screen.getByRole("searchbox"), "react");

    const hits = await screen.findAllByTestId("search-result");
    expect(hits).toHaveLength(2);
  });

  it("re-queries and narrows the hits when a category filter is chosen", async () => {
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderSearch("/search?q=react");
    expect(await screen.findAllByTestId("search-result")).toHaveLength(2);

    await screen.findByRole("option", { name: "Hilfe" });
    await user.selectOptions(screen.getByLabelText("Kategorie"), "hilfe");

    await waitFor(() =>
      expect(screen.getAllByTestId("search-result")).toHaveLength(1),
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("category=hilfe"),
      ),
    ).toBe(true);
  });

  it("shows the empty state for a query without hits instead of an error", async () => {
    vi.stubGlobal("fetch", stubFetch());
    const user = userEvent.setup();

    renderSearch();
    await user.type(screen.getByRole("searchbox"), "nothing");

    expect(await screen.findByText(/Keine Treffer/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
