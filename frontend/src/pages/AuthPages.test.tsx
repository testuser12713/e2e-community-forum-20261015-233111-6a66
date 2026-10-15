import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { getAccessToken, setAccessToken } from "../api/client";
import type { UserMe } from "../api/types";
import LoginPage from "./LoginPage";
import RegisterPage from "./RegisterPage";

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

function renderRoute(initialPath: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<div>Forum-Feed</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function SessionProbe() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div>lädt</div>;
  return <div>{user ? `Angemeldet als ${user.username}` : "Gast"}</div>;
}

beforeEach(() => {
  localStorage.clear();
  setAccessToken(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LoginPage", () => {
  it("stores the session and navigates to the feed on success", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/login")) {
        return jsonResponse(
          {
            access_token: "token-123",
            token_type: "bearer",
            expires_in: 900,
            user: me,
          },
          200,
        );
      }
      return jsonResponse(
        { error: { code: "not_found", message: "nf", details: null } },
        404,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute("/login");

    await user.type(
      screen.getByLabelText("Benutzername oder E-Mail"),
      "alice",
    );
    await user.type(screen.getByLabelText("Passwort"), "SichereS3!chens");
    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(await screen.findByText("Forum-Feed")).toBeInTheDocument();
    expect(getAccessToken()).toBe("token-123");
  });

  it("shows no validation feedback on an untouched form", () => {
    renderRoute("/login");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Bitte Passwort angeben."),
    ).not.toBeInTheDocument();
  });

  it("shows the conflict message from the error envelope", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/login")) {
        return jsonResponse(
          {
            error: {
              code: "invalid_credentials",
              message: "Benutzername oder Passwort ist falsch.",
              details: null,
            },
          },
          401,
        );
      }
      return jsonResponse(
        { error: { code: "not_found", message: "nf", details: null } },
        404,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute("/login");

    await user.type(
      screen.getByLabelText("Benutzername oder E-Mail"),
      "alice",
    );
    await user.type(screen.getByLabelText("Passwort"), "SichereS3!chens");
    await user.click(screen.getByRole("button", { name: "Anmelden" }));

    expect(
      await screen.findByText("Benutzername oder Passwort ist falsch."),
    ).toBeInTheDocument();
  });
});

describe("RegisterPage", () => {
  it("shows no validation feedback on an untouched form", () => {
    renderRoute("/register");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the conflict message from the error envelope", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/register")) {
        return jsonResponse(
          {
            error: {
              code: "conflict",
              message: "Benutzername oder E-Mail ist bereits vergeben.",
              details: null,
            },
          },
          409,
        );
      }
      return jsonResponse(
        { error: { code: "not_found", message: "nf", details: null } },
        404,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute("/register");

    await user.type(screen.getByLabelText("Benutzername"), "alice");
    await user.type(screen.getByLabelText("E-Mail"), "alice@example.com");
    await user.type(screen.getByLabelText("Passwort"), "SichereS3!chens");
    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    expect(
      await screen.findByText("Benutzername oder E-Mail ist bereits vergeben."),
    ).toBeInTheDocument();
  });

  it("shows a 422 field error next to its field", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/register")) {
        return jsonResponse(
          {
            error: {
              code: "validation_error",
              message: "Ungültige Eingabe.",
              details: [
                { field: "password", message: "Das Passwort ist zu schwach." },
              ],
            },
          },
          422,
        );
      }
      return jsonResponse(
        { error: { code: "not_found", message: "nf", details: null } },
        404,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    renderRoute("/register");

    await user.type(screen.getByLabelText("Benutzername"), "alice");
    await user.type(screen.getByLabelText("E-Mail"), "alice@example.com");
    await user.type(screen.getByLabelText("Passwort"), "SichereS3!chens");
    await user.click(screen.getByRole("button", { name: "Registrieren" }));

    expect(await screen.findByText("Das Passwort ist zu schwach.")).toBeInTheDocument();
  });
});

describe("expired access token", () => {
  it("refreshes silently and repeats the request so the user sees no error", async () => {
    setAccessToken("expired-token");

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
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
        if (url.includes("/api/v1/users/me")) {
          if (authHeader === "Bearer fresh-token") {
            return jsonResponse(me, 200);
          }
          return jsonResponse(
            {
              error: {
                code: "unauthorized",
                message: "token expired",
                details: null,
              },
            },
            401,
          );
        }
        return jsonResponse(
          { error: { code: "not_found", message: "nf", details: null } },
          404,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText("Angemeldet als alice")).toBeInTheDocument();
    expect(screen.queryByText(/fehler/i)).not.toBeInTheDocument();
    expect(getAccessToken()).toBe("fresh-token");

    const calls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(calls.filter((url) => url.includes("/auth/refresh"))).toHaveLength(1);
    expect(calls.filter((url) => url.includes("/users/me"))).toHaveLength(2);
  });
});
