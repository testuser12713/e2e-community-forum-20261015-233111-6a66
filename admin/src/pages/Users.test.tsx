import "@testing-library/jest-dom/vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminUserOut } from "../api/types";
import UsersPage from "./UsersPage";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function makeUser(overrides: Partial<AdminUserOut> = {}): AdminUserOut {
  return {
    id: 1,
    username: "alice",
    email: "alice@example.com",
    display_name: "Alice",
    role: "user",
    karma: 0,
    is_banned: false,
    ban_reason: null,
    ban_expires_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

let users: AdminUserOut[];

async function handleFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  const method = (init?.method ?? "GET").toUpperCase();
  const parsed = new URL(url, "http://localhost");
  const path = parsed.pathname;

  if (path === "/api/v1/admin/users" && method === "GET") {
    const q = (parsed.searchParams.get("q") ?? "").toLowerCase();
    const page = Number(parsed.searchParams.get("page") ?? "1");
    const filtered = q
      ? users.filter(
          (user) =>
            user.username.toLowerCase().includes(q) ||
            user.email.toLowerCase().includes(q),
        )
      : users;
    return jsonResponse(200, {
      items: filtered,
      page,
      per_page: 20,
      total: filtered.length,
      pages: 1,
    });
  }

  const roleMatch = path.match(/^\/api\/v1\/admin\/users\/(\d+)\/role$/);
  if (roleMatch && method === "PATCH") {
    const id = Number(roleMatch[1]);
    const body = JSON.parse(String(init?.body ?? "{}")) as { role: string };
    users = users.map((user) =>
      user.id === id ? { ...user, role: body.role as AdminUserOut["role"] } : user,
    );
    return jsonResponse(200, users.find((user) => user.id === id));
  }

  const banMatch = path.match(/^\/api\/v1\/admin\/users\/(\d+)\/ban$/);
  if (banMatch && method === "POST") {
    const id = Number(banMatch[1]);
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      reason: string;
      expires_at?: string | null;
    };
    users = users.map((user) =>
      user.id === id
        ? {
            ...user,
            is_banned: true,
            ban_reason: body.reason,
            ban_expires_at: body.expires_at ?? null,
          }
        : user,
    );
    return jsonResponse(200, users.find((user) => user.id === id));
  }
  if (banMatch && method === "DELETE") {
    const id = Number(banMatch[1]);
    users = users.map((user) =>
      user.id === id
        ? { ...user, is_banned: false, ban_reason: null, ban_expires_at: null }
        : user,
    );
    return jsonResponse(200, users.find((user) => user.id === id));
  }

  return jsonResponse(404, {
    error: { code: "not_found", message: "Not found", details: null },
  });
}

beforeEach(() => {
  users = [
    makeUser({
      id: 1,
      username: "alice",
      display_name: "Alice",
      email: "alice@example.com",
    }),
    makeUser({
      id: 2,
      username: "bob",
      display_name: "Bob",
      email: "bob@example.com",
      karma: 5,
    }),
  ];
  vi.stubGlobal("fetch", vi.fn(handleFetch));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin users page", () => {
  it("filters the list by username and e-mail", async () => {
    const user = userEvent.setup();
    render(<UsersPage />);

    await screen.findByText("Alice");
    expect(screen.getByText("Bob")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nutzer durchsuchen"), "bob");
    await user.click(screen.getByRole("button", { name: "Suchen" }));

    await waitFor(() =>
      expect(screen.queryByText("Alice")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("changes a role and reflects it in the row", async () => {
    const user = userEvent.setup();
    render(<UsersPage />);

    await screen.findByText("Bob");
    const row = screen.getByTestId("user-row-2");
    await user.click(within(row).getByRole("button", { name: "Rolle ändern" }));

    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByRole("combobox"), "moderator");
    await user.click(within(dialog).getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(
        within(screen.getByTestId("user-row-2")).getByText("Moderator"),
      ).toBeInTheDocument(),
    );
  });

  it("shows reason and expiry in the list after banning", async () => {
    const user = userEvent.setup();
    render(<UsersPage />);

    await screen.findByText("Bob");
    await user.click(
      within(screen.getByTestId("user-row-2")).getByRole("button", {
        name: "Sperren",
      }),
    );

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Grund"), "Spam");
    fireEvent.change(within(dialog).getByLabelText(/Sperre bis/), {
      target: { value: "2026-03-14" },
    });
    await user.click(within(dialog).getByRole("button", { name: "Sperren" }));

    const updated = await screen.findByTestId("user-row-2");
    expect(within(updated).getByText(/Gesperrt: Spam/)).toBeInTheDocument();
    expect(within(updated).getByText(/bis 14\.03\.2026/)).toBeInTheDocument();
  });

  it("lifts a ban and shows the row as active again", async () => {
    const user = userEvent.setup();
    users = users.map((entry) =>
      entry.id === 2
        ? { ...entry, is_banned: true, ban_reason: "Spam" }
        : entry,
    );
    render(<UsersPage />);

    await screen.findByText("Bob");
    await user.click(
      within(screen.getByTestId("user-row-2")).getByRole("button", {
        name: "Sperre aufheben",
      }),
    );

    await waitFor(() =>
      expect(
        within(screen.getByTestId("user-row-2")).getByText("Aktiv"),
      ).toBeInTheDocument(),
    );
  });

  it("shows no validation feedback on an untouched ban dialog", async () => {
    const user = userEvent.setup();
    render(<UsersPage />);

    await screen.findByText("Bob");
    await user.click(
      within(screen.getByTestId("user-row-2")).getByRole("button", {
        name: "Sperren",
      }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Bitte einen Grund angeben."),
    ).not.toBeInTheDocument();
  });
});
