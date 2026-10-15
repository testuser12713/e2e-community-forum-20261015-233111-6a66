import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import {
  getAccessToken,
  request,
  setAccessToken,
} from "./api/client";
import type { UserMe } from "./api/types";

function navigate(path: string) {
  window.history.pushState({}, "", path);
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  setAccessToken(null);
  navigate("/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("forum shell", () => {
  it("renders the app frame with navigation and an active-user area", () => {
    render(<App />);

    expect(
      screen.getByRole("link", { name: /Forum – Startseite/i }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Hauptnavigation" });
    expect(nav).toHaveTextContent("Startseite");
    expect(nav).toHaveTextContent("Suche");
    expect(nav).toHaveTextContent("Neuer Thread");

    // Not signed in: the shell offers login and registration.
    expect(screen.getByRole("link", { name: "Anmelden" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Registrieren" }),
    ).toBeInTheDocument();

    // The theme toggle and the notification-bell slot are present.
    expect(
      screen.getByRole("button", { name: /Farbschema/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Benachrichtigungen/i }),
    ).toBeInTheDocument();
  });

  // Only routes that are still placeholders. /new and /t/:id/edit are
  // implemented by the thread editor, /login and /register by the auth pages —
  // each covered by its own test file.
  const routes: Array<[string, string]> = [
    ["/t/42", "Thread"],
    // "/search" is implemented by its own ticket and no longer a placeholder.
    ["/u/alice", "Profil"],
    ["/settings", "Einstellungen"],
    ["/notifications", "Benachrichtigungen"],
  ];

  it.each(routes)("resolves route %s to its placeholder", (path, title) => {
    navigate(path);
    render(<App />);
    expect(
      screen.getByRole("heading", { name: title, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("In Arbeit").length).toBeGreaterThan(0);
  });

  it.each([
    ["/login", "Anmelden"],
    ["/register", "Registrieren"],
  ])("renders the real auth form at %s", (path, title) => {
    navigate(path);
    render(<App />);
    expect(
      screen.getByRole("heading", { name: title, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("In Arbeit")).not.toBeInTheDocument();
  });

  it("shows a placeholder for an unknown route", () => {
    navigate("/does-not-exist");
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Seite nicht gefunden", level: 1 }),
    ).toBeInTheDocument();
  });
});

describe("theme switching", () => {
  it("switches the theme without a reload and survives a reload", async () => {
    const user = userEvent.setup();
    expect(document.documentElement).not.toHaveClass("dark");

    const first = render(<App />);
    const toggle = screen.getByRole("button", { name: /Farbschema/i });

    // Default is the system preference; one cycle lands on dark.
    await user.click(toggle);
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("forum.theme")).toBe("dark");

    // A reload means a fresh mount; the choice persists in localStorage.
    first.unmount();
    render(<App />);
    expect(document.documentElement).toHaveClass("dark");
    expect(
      screen.getByRole("button", { name: /Farbschema: Dunkel/i }),
    ).toBeInTheDocument();
  });
});

describe("api client refresh", () => {
  const me: UserMe = {
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
  };

  function jsonResponse(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("refreshes once on a 401 and repeats the original request silently", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = (init?.method ?? "GET").toUpperCase();
        const authHeader =
          (init?.headers as Record<string, string> | undefined)?.[
            "Authorization"
          ] ?? "";

        if (url.includes("/api/v1/auth/refresh")) {
          return jsonResponse(
            {
              access_token: "fresh-token",
              token_type: "bearer",
              expires_in: 900,
              user: me,
            },
            200,
          );
        }
        if (url.includes("/api/v1/users/me") && method === "GET") {
          if (authHeader === "Bearer fresh-token") {
            return jsonResponse(me, 200);
          }
          return jsonResponse(
            { error: { code: "unauthorized", message: "token expired", details: null } },
            401,
          );
        }
        return jsonResponse(
          { error: { code: "not_found", message: "not found", details: null } },
          404,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await request<UserMe>("/api/v1/users/me");

    expect(result.username).toBe("alice");
    expect(getAccessToken()).toBe("fresh-token");
    // original (401) + refresh + repeated request.
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.filter((u) => u.includes("/auth/refresh"))).toHaveLength(1);
    expect(calls.filter((u) => u.includes("/users/me"))).toHaveLength(2);
  });

  it("surfaces the error envelope as a typed error when refresh fails", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/v1/auth/refresh")) {
          return jsonResponse(
            { error: { code: "unauthorized", message: "no session", details: null } },
            401,
          );
        }
        void init;
        return jsonResponse(
          {
            error: {
              code: "forbidden",
              message: "Kein Zugriff",
              details: [{ field: "role", message: "zu niedrig" }],
            },
          },
          403,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/api/v1/admin/stats")).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
      message: "Kein Zugriff",
    });
  });
});
