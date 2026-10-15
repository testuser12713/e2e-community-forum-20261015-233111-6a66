import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { API_BASE_URL } from "../api/client";
import type { CommentNode } from "../api/types";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: {
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
    },
  }),
}));

import { CommentTree } from "./CommentTree";
import { CommentComposer } from "./CommentComposer";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeComment(overrides: Partial<CommentNode> & { id: number }): CommentNode {
  return {
    thread_id: 1,
    parent_id: null,
    depth: 1,
    author: {
      id: 2,
      username: "bob",
      display_name: "Bob",
      avatar_url: null,
    },
    body_markdown: "Kommentar",
    body_html: "<p>Kommentar</p>",
    score: 0,
    my_vote: 0,
    is_deleted: false,
    created_at: "2026-01-01T00:00:00Z",
    edited_at: null,
    replies: [],
    ...overrides,
  };
}

function page(items: CommentNode[]) {
  return { items, page: 1, per_page: 20, total: items.length, pages: 1 };
}

function renderTree(threadId = 1) {
  return render(
    <MemoryRouter>
      <CommentTree threadId={threadId} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CommentTree", () => {
  it("renders the nested replies with their depth", async () => {
    const grandchild = makeComment({
      id: 3,
      parent_id: 2,
      depth: 3,
      body_markdown: "Dritte",
      body_html: "<p>Dritte</p>",
    });
    const child = makeComment({
      id: 2,
      parent_id: 1,
      depth: 2,
      body_markdown: "Zweite",
      body_html: "<p>Zweite</p>",
      replies: [grandchild],
    });
    const root = makeComment({
      id: 1,
      body_markdown: "Erste",
      body_html: "<p>Erste</p>",
      replies: [child],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(page([root]), 200)),
    );

    renderTree();

    expect(await screen.findByText("Erste")).toBeInTheDocument();
    expect(screen.getByText("Zweite")).toBeInTheDocument();
    expect(screen.getByText("Dritte")).toBeInTheDocument();

    const first = screen.getByText("Erste").closest("[data-depth]");
    const second = screen.getByText("Zweite").closest("[data-depth]");
    const third = screen.getByText("Dritte").closest("[data-depth]");
    expect(first).toHaveAttribute("data-depth", "1");
    expect(second).toHaveAttribute("data-depth", "2");
    expect(third).toHaveAttribute("data-depth", "3");

    // Each deeper node is rendered inside its parent's subtree.
    const firstItem = screen.getByText("Erste").closest("[data-comment-id]");
    const secondItem = screen.getByText("Zweite").closest("[data-comment-id]");
    const thirdItem = screen.getByText("Dritte").closest("[data-comment-id]");
    expect(firstItem?.contains(secondItem as HTMLElement)).toBe(true);
    expect(secondItem?.contains(thirdItem as HTMLElement)).toBe(true);
  });

  it("posts a reply and refreshes the tree", async () => {
    const root = makeComment({ id: 1, body_html: "<p>Erste</p>" });
    const reply = makeComment({
      id: 5,
      parent_id: 1,
      depth: 2,
      body_markdown: "Meine Antwort",
      body_html: "<p>Meine Antwort</p>",
    });
    let getCount = 0;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.includes("/api/v1/threads/1/comments") && method === "GET") {
          getCount += 1;
          return jsonResponse(
            page(getCount === 1 ? [root] : [{ ...root, replies: [reply] }]),
            200,
          );
        }
        if (url.includes("/api/v1/threads/1/comments") && method === "POST") {
          return jsonResponse(reply, 201);
        }
        return jsonResponse(
          { error: { code: "not_found", message: "not found", details: null } },
          404,
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderTree();

    expect(await screen.findByText("Erste")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Antworten" }));

    const replyForm = screen
      .getByLabelText("Antwort an @bob")
      .closest("form") as HTMLFormElement;
    await user.type(
      screen.getByLabelText("Antwort an @bob"),
      "Meine Antwort",
    );
    await user.click(within(replyForm).getByRole("button", { name: "Antwort senden" }));

    await waitFor(() =>
      expect(screen.getByText("Meine Antwort")).toBeInTheDocument(),
    );
    expect(getCount).toBe(2);

    const postCall = fetchMock.mock.calls.find(
      (call) => (call[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(String(postCall?.[0])).toBe(
      `${API_BASE_URL}/api/v1/threads/1/comments`,
    );
    expect(JSON.parse(String((postCall?.[1] as RequestInit).body))).toEqual({
      body: "Meine Antwort",
      parent_id: 1,
    });
  });

  it("shows the blocked hint after a 429 and keeps the composer blocked", async () => {
    const root = makeComment({ id: 1, body_html: "<p>Erste</p>" });
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.includes("/api/v1/threads/1/comments") && method === "GET") {
          return jsonResponse(page([root]), 200);
        }
        if (url.includes("/api/v1/threads/1/comments") && method === "POST") {
          return jsonResponse(
            {
              error: {
                code: "rate_limited",
                message: "Zu viele Beiträge.",
                details: null,
              },
            },
            429,
          );
        }
        return jsonResponse({}, 404);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderTree();
    await screen.findByText("Erste");

    const form = screen
      .getByLabelText("Kommentar verfassen")
      .closest("form") as HTMLFormElement;
    await user.type(screen.getByLabelText("Kommentar verfassen"), "Hallo");
    await user.click(within(form).getByRole("button", { name: "Kommentar senden" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Zu viele Beiträge"),
    );
    expect(
      within(form).getByRole("button", { name: "Kommentar senden" }),
    ).toBeDisabled();
  });
});

describe("CommentComposer", () => {
  it("shows no validation feedback on an untouched form", () => {
    render(<CommentComposer onSubmit={() => {}} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the validation feedback only after the field was touched", async () => {
    const user = userEvent.setup();
    render(<CommentComposer onSubmit={() => {}} />);

    const textarea = screen.getByLabelText("Kommentar");
    await user.click(textarea);
    await user.tab();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Bitte gib einen Kommentar ein.",
    );
  });
});
