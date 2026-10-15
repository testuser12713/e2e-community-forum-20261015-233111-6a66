import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { NotificationOut, UserOut } from "../api/types";

const authState = vi.hoisted(() => ({
  user: null as null | {
    id: number;
    username: string;
    display_name: string;
    role: "user" | "moderator" | "admin";
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: authState.user }),
}));

import { NotificationBell } from "./NotificationBell";
import NotificationsPage from "../pages/NotificationsPage";

const actor: UserOut = {
  id: 2,
  username: "bob",
  display_name: "Bob",
  avatar_url: null,
};

function makeNotification(
  id: number,
  overrides: Partial<NotificationOut> = {},
): NotificationOut {
  return {
    id,
    type: "reply",
    thread_id: 10,
    comment_id: null,
    actor,
    is_read: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

let notifications: NotificationOut[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  authState.user = {
    id: 1,
    username: "alice",
    display_name: "Alice",
    role: "user",
  };
  notifications = [makeNotification(1), makeNotification(2)];

  fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.pathname === "/api/v1/notifications/unread-count") {
        const unread = notifications.filter((n) => !n.is_read).length;
        return jsonResponse({ unread }, 200);
      }

      if (url.pathname === "/api/v1/notifications" && method === "GET") {
        return jsonResponse(
          {
            items: notifications,
            page: 1,
            per_page: 20,
            total: notifications.length,
            pages: 1,
          },
          200,
        );
      }

      if (
        url.pathname === "/api/v1/notifications/read-all" &&
        method === "POST"
      ) {
        notifications = notifications.map((n) => ({ ...n, is_read: true }));
        return emptyResponse(204);
      }

      const single = url.pathname.match(
        /^\/api\/v1\/notifications\/(\d+)\/read$/,
      );
      if (single && method === "POST") {
        const id = Number(single[1]);
        notifications = notifications.map((n) =>
          n.id === id ? { ...n, is_read: true } : n,
        );
        return emptyResponse(204);
      }

      return jsonResponse(
        { error: { code: "not_found", message: "not found", details: null } },
        404,
      );
    },
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderBellAndPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/notifications"]}>
        <NotificationBell />
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("NotificationBell", () => {
  it("shows the unread count from GET /notifications/unread-count", async () => {
    renderBellAndPage();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Benachrichtigungen, 2 ungelesen" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("2");
  });
});

describe("NotificationsPage", () => {
  it("lowers the unread count when a single notification is marked read", async () => {
    const user = userEvent.setup();
    renderBellAndPage();

    const markButtons = await screen.findAllByRole("button", {
      name: "Als gelesen markieren",
    });
    expect(markButtons).toHaveLength(2);

    await user.click(markButtons[0]);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Benachrichtigungen, 1 ungelesen" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("notification-badge")).toHaveTextContent("1");
  });

  it("sets the unread count to zero on 'Alle als gelesen markieren'", async () => {
    const user = userEvent.setup();
    renderBellAndPage();

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Benachrichtigungen, 2 ungelesen" }),
      ).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole("button", { name: "Alle als gelesen markieren" }),
    );

    await waitFor(() =>
      expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /ungelesen/ }),
    ).not.toBeInTheDocument();
  });

  it("renders the empty state when there are no notifications", async () => {
    notifications = [];
    renderBellAndPage();

    expect(
      await screen.findByText("Keine Benachrichtigungen"),
    ).toBeInTheDocument();
  });
});
