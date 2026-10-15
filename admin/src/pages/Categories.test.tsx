import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CategoriesPage from "./CategoriesPage";
import type { CategoryOut, Page } from "../api/types";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function page(items: CategoryOut[]): Page<CategoryOut> {
  return {
    items,
    page: 1,
    per_page: 100,
    total: items.length,
    pages: 1,
  };
}

function category(
  id: number,
  name: string,
  position: number,
  overrides: Partial<CategoryOut> = {},
): CategoryOut {
  return {
    id,
    name,
    slug: name.toLowerCase(),
    description: null,
    position,
    ...overrides,
  };
}

interface Call {
  method: string;
  url: string;
  body: unknown;
}

let categories: CategoryOut[];
let calls: Call[];
let nextId: number;
let createConflict: boolean;

function installFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : null;
      calls.push({ method, url, body });

      if (url.includes("/api/v1/admin/categories/order") && method === "PUT") {
        const ids = (body as { ids: number[] }).ids;
        categories = ids
          .map((id) => categories.find((c) => c.id === id))
          .filter((c): c is CategoryOut => Boolean(c))
          .map((c, index) => ({ ...c, position: index }));
        return jsonResponse(200, page(categories));
      }

      if (
        url.endsWith("/api/v1/admin/categories") &&
        method === "POST"
      ) {
        if (createConflict) {
          return jsonResponse(409, {
            error: {
              code: "conflict",
              message: "Dieser Slug ist bereits vergeben.",
              details: null,
            },
          });
        }
        const payload = body as {
          name: string;
          slug: string;
          description: string | null;
          position: number;
        };
        const created: CategoryOut = {
          id: nextId++,
          name: payload.name,
          slug: payload.slug,
          description: payload.description,
          position: payload.position,
        };
        categories = [...categories, created];
        return jsonResponse(201, created);
      }

      if (
        /\/api\/v1\/admin\/categories\/\d+$/.test(url) &&
        method === "PATCH"
      ) {
        const id = Number(url.split("/").pop());
        const patch = body as Partial<CategoryOut>;
        categories = categories.map((c) =>
          c.id === id ? { ...c, ...patch } : c,
        );
        return jsonResponse(
          200,
          categories.find((c) => c.id === id) ?? null,
        );
      }

      if (url.includes("/api/v1/categories") && method === "GET") {
        return jsonResponse(200, page(categories));
      }

      return jsonResponse(404, {
        error: { code: "not_found", message: "Nicht gefunden.", details: null },
      });
    }),
  );
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <CategoriesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  categories = [];
  calls = [];
  nextId = 1;
  createConflict = false;
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin category management", () => {
  it("creates a category that then appears in the list", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByTestId("category-empty")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Neue Kategorie" }));
    await user.type(screen.getByLabelText("Name"), "Allgemein");
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(await screen.findByText("Allgemein")).toBeInTheDocument();

    const create = calls.find(
      (call) =>
        call.method === "POST" &&
        call.url.endsWith("/api/v1/admin/categories"),
    );
    expect(create).toBeTruthy();
    expect(create?.body).toMatchObject({
      name: "Allgemein",
      slug: "allgemein",
      position: 0,
    });
  });

  it("posts the reordered id list when a category is moved", async () => {
    categories = [category(1, "Erste", 0), category(2, "Zweite", 1)];
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Erste")).toBeInTheDocument();

    const rows = screen.getAllByRole("listitem");
    await user.click(
      within(rows[0]).getByRole("button", { name: "Erste nach unten" }),
    );

    await waitFor(() => {
      const reorder = calls.find(
        (call) =>
          call.method === "PUT" &&
          call.url.endsWith("/api/v1/admin/categories/order"),
      );
      expect(reorder).toBeTruthy();
      expect(reorder?.body).toEqual({ ids: [2, 1] });
    });
  });

  it("surfaces a duplicate-slug 409 from the error envelope", async () => {
    createConflict = true;
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("category-empty");
    await user.click(screen.getByRole("button", { name: "Neue Kategorie" }));
    await user.type(screen.getByLabelText("Name"), "Allgemein");
    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(
      await screen.findByText("Dieser Slug ist bereits vergeben."),
    ).toBeInTheDocument();
  });

  it("shows no validation feedback on an untouched form", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("category-empty");
    await user.click(screen.getByRole("button", { name: "Neue Kategorie" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Speichern" }));

    expect(
      await screen.findByText("Bitte einen Namen angeben."),
    ).toBeInTheDocument();
  });
});
