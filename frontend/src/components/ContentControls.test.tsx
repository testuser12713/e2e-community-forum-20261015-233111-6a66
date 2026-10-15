import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const authState = vi.hoisted(() => ({
  user: null as null | { role: "user" | "moderator" | "admin" },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: authState.user }),
}));

import { SubscribeButton } from "./SubscribeButton";
import { ReportDialog } from "./ReportDialog";
import { ModerationMenu } from "./ModerationMenu";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

const reporter = {
  id: 2,
  username: "bob",
  display_name: "Bob",
  avatar_url: null,
};

beforeEach(() => {
  localStorage.clear();
  authState.user = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SubscribeButton", () => {
  it("reads the subscription state and switches it to 'Abonniert' and back", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.includes("/subscription") && method === "GET") {
          return jsonResponse({ subscribed: false }, 200);
        }
        if (url.includes("/subscription") && (method === "POST" || method === "DELETE")) {
          return emptyResponse(204);
        }
        return jsonResponse(
          { error: { code: "not_found", message: "not found", details: null } },
          404,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<SubscribeButton threadId={7} />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Abonnieren" }),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Abonnieren" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Abonniert" }),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Abonniert" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Abonnieren" }),
      ).toBeInTheDocument(),
    );
  });
});

describe("ReportDialog", () => {
  it("starts neutral and posts reason and optional note", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void init;
        if (String(input).endsWith("/api/v1/reports")) {
          return jsonResponse(
            {
              id: 1,
              content_type: "thread",
              content_id: 1,
              reason: "Spam",
              note: "Bitte prüfen",
              reporter,
              status: "open",
              created_at: "2026-01-01T00:00:00Z",
              resolved_at: null,
            },
            201,
          );
        }
        return jsonResponse(
          { error: { code: "not_found", message: "not found", details: null } },
          404,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ReportDialog
        open
        content_type="thread"
        content_id={1}
        onClose={() => {}}
      />,
    );

    // An untouched form shows no validation feedback (AC-44).
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Spam" }));
    await user.type(screen.getByLabelText("Notiz (optional)"), "Bitte prüfen");
    await user.click(screen.getByRole("button", { name: "Meldung senden" }));

    await waitFor(() =>
      expect(
        screen.getByText("Danke, die Meldung liegt in der Warteschlange"),
      ).toBeInTheDocument(),
    );

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      content_type: "thread",
      content_id: 1,
      reason: "Spam",
      note: "Bitte prüfen",
    });
  });

  it("shows the conflict message when an open report already exists (409)", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void init;
        if (String(input).endsWith("/api/v1/reports")) {
          return jsonResponse(
            {
              error: {
                code: "report_exists",
                message: "Der Inhalt wurde bereits gemeldet.",
                details: null,
              },
            },
            409,
          );
        }
        return jsonResponse(
          { error: { code: "not_found", message: "not found", details: null } },
          404,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ReportDialog
        open
        content_type="comment"
        content_id={5}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Beleidigung" }));
    await user.click(screen.getByRole("button", { name: "Meldung senden" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Du hast diesen Inhalt bereits gemeldet.",
      ),
    );
  });
});

describe("ModerationMenu", () => {
  it("is not rendered for a plain user", () => {
    authState.user = { role: "user" };
    render(<ModerationMenu threadId={1} />);
    expect(
      screen.queryByRole("button", { name: "Moderationsmenü" }),
    ).not.toBeInTheDocument();
  });

  it("offers the moderation actions to a moderator", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/moderate")) {
          return jsonResponse({}, 200);
        }
        return jsonResponse(
          { error: { code: "not_found", message: "not found", details: null } },
          404,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    authState.user = { role: "moderator" };
    render(<ModerationMenu threadId={1} />);

    await user.click(
      screen.getByRole("button", { name: "Moderationsmenü" }),
    );
    expect(screen.getByRole("menuitem", { name: "Sperren" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Verschieben" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Entfernen" }),
    ).toBeInTheDocument();
  });
});
