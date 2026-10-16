import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminStats } from "../api/types";
import DashboardPage from "./DashboardPage";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const stats: AdminStats = {
  total_users: 1234,
  new_users_7d: 56,
  total_threads: 789,
  total_comments: 4321,
  comments_today: 12,
  comments_7d: 345,
  open_reports: 7,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DashboardPage", () => {
  it("renders every figure from the stats endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, stats)),
    );

    renderDashboard();

    expect(
      await screen.findByText("Nutzer gesamt"),
    ).toBeInTheDocument();
    expect(screen.getByText("1.234")).toBeInTheDocument();
    expect(screen.getByText("Neu in 7 Tagen")).toBeInTheDocument();
    expect(screen.getByText("56")).toBeInTheDocument();
    expect(screen.getByText("Threads")).toBeInTheDocument();
    expect(screen.getByText("789")).toBeInTheDocument();
    expect(screen.getByText("Kommentare heute")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Kommentare in 7 Tagen")).toBeInTheDocument();
    expect(screen.getByText("345")).toBeInTheDocument();
    expect(screen.getByText("Offene Meldungen")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("links the open-reports figure to the moderation queue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, stats)),
    );

    renderDashboard();

    const link = await screen.findByRole("link", {
      name: /Offene Meldungen/,
    });
    expect(link).toHaveAttribute("href", "/moderation-queue");
    expect(within(link).getByText("7")).toBeInTheDocument();
  });

  it("shows the not-authorised state on 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(403, {
          error: {
            code: "forbidden",
            message: "Nur Administratoren.",
            details: null,
          },
        }),
      ),
    );

    renderDashboard();

    expect(
      await screen.findByTestId("dashboard-not-authorised"),
    ).toBeInTheDocument();
    expect(screen.getByText("Nicht berechtigt")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-error")).not.toBeInTheDocument();
  });

  it("shows the German signed-out state with a sign-in button on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(401, {
          error: {
            code: "unauthorized",
            message: "Not authenticated",
            details: null,
          },
        }),
      ),
    );

    renderDashboard();

    expect(
      await screen.findByTestId("dashboard-not-authenticated"),
    ).toBeInTheDocument();
    expect(screen.getByText("Nicht angemeldet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Anmelden" }),
    ).toBeInTheDocument();
    // The raw English server string is never shown.
    expect(screen.queryByText("Not authenticated")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-not-authorised")).not.toBeInTheDocument();
  });
});
