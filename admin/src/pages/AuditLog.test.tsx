import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditLogOut, AuditTargetType } from "../api/types";
import AuditLogPage from "./AuditLogPage";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function makeEntry(
  id: number,
  overrides: Partial<AuditLogOut> = {},
): AuditLogOut {
  return {
    id,
    actor: {
      id: 1,
      username: "admin",
      display_name: "Admin",
      avatar_url: null,
    },
    action: "thread.pin",
    target_type: "thread",
    target_id: 12,
    metadata: {},
    created_at: "2026-01-02T10:00:00.000Z",
    ...overrides,
  };
}

interface Call {
  method: string;
  url: string;
  params: URLSearchParams;
}

let entries: AuditLogOut[];
let calls: Call[];
let forbidden: boolean;

function installFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const parsed = new URL(String(input), "http://localhost");
      calls.push({ method, url: parsed.pathname, params: parsed.searchParams });

      if (forbidden) {
        return jsonResponse(403, {
          error: {
            code: "forbidden",
            message: "Nur Administratoren.",
            details: null,
          },
        });
      }

      if (parsed.pathname === "/api/v1/admin/audit-logs" && method === "GET") {
        const actor = parsed.searchParams.get("actor_id");
        const action = parsed.searchParams.get("action");
        const targetType = parsed.searchParams.get("target_type");
        let filtered = entries;
        if (actor) {
          filtered = filtered.filter((e) => e.actor?.id === Number(actor));
        }
        if (action) {
          filtered = filtered.filter((e) => e.action === action);
        }
        if (targetType) {
          filtered = filtered.filter(
            (e) => e.target_type === (targetType as AuditTargetType),
          );
        }
        const page = Number(parsed.searchParams.get("page") ?? "1");
        return jsonResponse(200, {
          items: filtered,
          page,
          per_page: 20,
          total: filtered.length,
          pages: filtered.length > 0 ? 1 : 0,
        });
      }

      return jsonResponse(404, {
        error: { code: "not_found", message: "Nicht gefunden.", details: null },
      });
    }),
  );
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuditLogPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  forbidden = false;
  calls = [];
  entries = [
    makeEntry(1, {
      actor: {
        id: 1,
        username: "admin",
        display_name: "Admin",
        avatar_url: null,
      },
      action: "thread.pin",
      target_type: "thread",
      target_id: 12,
      metadata: { category_id: 3 },
    }),
    makeEntry(2, {
      actor: null,
      action: "user.ban",
      target_type: "user",
      target_id: 5,
      metadata: { reason: "Spam" },
      created_at: "2026-01-01T08:30:00.000Z",
    }),
  ];
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin audit log page", () => {
  it("renders each entry with actor, action and target", async () => {
    renderPage();

    const row = await screen.findByTestId("audit-row-1");
    expect(within(row).getByText("Admin")).toBeInTheDocument();
    expect(within(row).getByText("thread.pin")).toBeInTheDocument();
    expect(within(row).getByText("Thread #12")).toBeInTheDocument();

    const systemRow = screen.getByTestId("audit-row-2");
    expect(within(systemRow).getByText("System")).toBeInTheDocument();
    expect(within(systemRow).getByText("user.ban")).toBeInTheDocument();
    expect(within(systemRow).getByText("Nutzer #5")).toBeInTheDocument();
  });

  it("renders the metadata of an entry", async () => {
    renderPage();

    const row = await screen.findByTestId("audit-row-1");
    expect(within(row).getByText(/category_id:/)).toBeInTheDocument();
    expect(within(row).getByText("3")).toBeInTheDocument();
  });

  it("re-queries the list when filtering by action", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByTestId("audit-row-1");

    await user.type(screen.getByLabelText("Aktion"), "user.ban");

    await waitFor(() =>
      expect(screen.queryByTestId("audit-row-1")).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("audit-row-2")).toBeInTheDocument();

    const filtered = calls.find(
      (call) =>
        call.url === "/api/v1/admin/audit-logs" &&
        call.params.get("action") === "user.ban",
    );
    expect(filtered).toBeTruthy();
  });

  it("shows the empty state when no entry matches", async () => {
    entries = [];
    renderPage();

    expect(await screen.findByTestId("audit-empty")).toBeInTheDocument();
    expect(screen.getByText("Keine Audit-Einträge")).toBeInTheDocument();
  });

  it("shows the not-authorised state on 403", async () => {
    forbidden = true;
    renderPage();

    expect(
      await screen.findByTestId("audit-not-authorised"),
    ).toBeInTheDocument();
    expect(screen.getByText("Nicht berechtigt")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Audit-Log" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("audit-error")).not.toBeInTheDocument();
  });
});
