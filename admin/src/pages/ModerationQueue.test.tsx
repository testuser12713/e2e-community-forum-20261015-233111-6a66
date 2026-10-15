import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Page, ReportOut, ReportStatus } from "../api/types";
import ModerationQueuePage from "./ModerationQueuePage";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function makeReport(overrides: Partial<ReportOut> = {}): ReportOut {
  return {
    id: 1,
    content_type: "thread",
    content_id: 42,
    reason: "Spam",
    note: null,
    reporter: {
      id: 7,
      username: "melder",
      display_name: "Melder",
      avatar_url: null,
    },
    status: "open",
    created_at: "2026-01-01T00:00:00.000Z",
    resolved_at: null,
    ...overrides,
  };
}

let reports: ReportOut[];
let fetchMock: ReturnType<typeof vi.fn>;

function installFetch(): void {
  fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const parsed = new URL(url, "http://localhost");
      const path = parsed.pathname;

      if (path === "/api/v1/moderation/reports" && method === "GET") {
        const status = parsed.searchParams.get("status");
        const items = status
          ? reports.filter((report) => report.status === status)
          : reports;
        const body: Page<ReportOut> = {
          items,
          page: 1,
          per_page: 20,
          total: items.length,
          pages: 1,
        };
        return jsonResponse(200, body);
      }

      const resolveMatch = path.match(
        /^\/api\/v1\/moderation\/reports\/(\d+)\/resolve$/,
      );
      if (resolveMatch && method === "POST") {
        const id = Number(resolveMatch[1]);
        const payload = JSON.parse(String(init?.body ?? "{}")) as {
          action: "remove_content" | "dismiss";
        };
        const nextStatus: ReportStatus =
          payload.action === "dismiss" ? "dismissed" : "resolved";
        let updated: ReportOut | undefined;
        reports = reports.map((report) => {
          if (report.id !== id) {
            return report;
          }
          updated = {
            ...report,
            status: nextStatus,
            resolved_at: "2026-01-02T00:00:00.000Z",
          };
          return updated;
        });
        return jsonResponse(200, updated ?? null);
      }

      return jsonResponse(404, {
        error: { code: "not_found", message: "Nicht gefunden.", details: null },
      });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
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
      <ModerationQueuePage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  reports = [];
  installFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin moderation queue", () => {
  it("renders a report with its content reference and reporter", async () => {
    reports = [makeReport({ note: "Bitte prüfen." })];
    renderPage();

    const row = await screen.findByTestId("report-row-1");
    expect(screen.getByText(/Meldung · Spam/)).toBeInTheDocument();
    expect(screen.getByTestId("report-content-1")).toHaveTextContent(
      "Thread #42",
    );
    expect(screen.getByText("Bitte prüfen.", { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId("report-reporter-1")).toHaveTextContent("Melder");
    expect(row).toBeInTheDocument();
  });

  it("removes the report from the open queue after resolving", async () => {
    const user = userEvent.setup();
    reports = [makeReport({ id: 5 })];
    renderPage();

    await screen.findByTestId("report-row-5");
    await user.click(screen.getByRole("button", { name: "Inhalt entfernen" }));

    await waitFor(() =>
      expect(screen.queryByTestId("report-row-5")).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByTestId("moderation-queue-empty"),
    ).toBeInTheDocument();

    const resolveCall = fetchMock.mock.calls.find(([, init]) =>
      String((init as RequestInit | undefined)?.method ?? "").includes("POST"),
    );
    expect(resolveCall).toBeTruthy();
    expect(String(resolveCall?.[0])).toContain(
      "/api/v1/moderation/reports/5/resolve",
    );
  });

  it("dismisses a report and drops it from the open queue", async () => {
    const user = userEvent.setup();
    reports = [makeReport({ id: 9, reason: "Sonstiges" })];
    renderPage();

    await screen.findByTestId("report-row-9");
    await user.click(screen.getByRole("button", { name: "Meldung verwerfen" }));

    await waitFor(() =>
      expect(screen.queryByTestId("report-row-9")).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByTestId("moderation-queue-empty"),
    ).toBeInTheDocument();
  });

  it("shows the empty state for an empty queue", async () => {
    reports = [];
    renderPage();

    expect(
      await screen.findByTestId("moderation-queue-empty"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("moderation-error")).not.toBeInTheDocument();
  });

  it("shows the not-authorised state on 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(403, {
          error: {
            code: "forbidden",
            message: "Nur Moderatoren.",
            details: null,
          },
        }),
      ),
    );

    renderPage();

    expect(
      await screen.findByTestId("moderation-not-authorised"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Warteschlange" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("moderation-error")).not.toBeInTheDocument();
  });
});
