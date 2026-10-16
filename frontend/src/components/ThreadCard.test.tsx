import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { API_BASE_URL } from "../api/client";
import type { ThreadSummary, UserOut } from "../api/types";

interface SessionUser {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  email: string;
  role: "user" | "moderator" | "admin";
  bio: string | null;
  karma: number;
  is_banned: boolean;
  ban_reason: string | null;
  ban_expires_at: string | null;
}

const authState = vi.hoisted(() => ({
  user: null as null | {
    id: number;
    username: string;
    display_name: string;
    avatar_url: string | null;
    email: string;
    role: "user" | "moderator" | "admin";
    bio: string | null;
    karma: number;
    is_banned: boolean;
    ban_reason: string | null;
    ban_expires_at: string | null;
  },
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: authState.user }),
}));

import { ThreadCard } from "./ThreadCard";

const author: UserOut = {
  id: 9,
  username: "alice",
  display_name: "Alice",
  avatar_url: null,
};

const viewer: SessionUser = {
  id: 1,
  username: "bob",
  display_name: "Bob",
  avatar_url: null,
  email: "bob@example.com",
  role: "user",
  bio: null,
  karma: 0,
  is_banned: false,
  ban_reason: null,
  ban_expires_at: null,
};

function makeThread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  const now = new Date().toISOString();
  return {
    id: 7,
    title: "Ein Thread",
    category: {
      id: 1,
      name: "Allgemein",
      slug: "allgemein",
      description: null,
      position: 1,
    },
    author,
    tags: [],
    score: 5,
    comment_count: 0,
    is_pinned: false,
    is_locked: false,
    is_deleted: false,
    created_at: now,
    last_activity_at: now,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderCard(thread: ThreadSummary) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <ThreadCard thread={thread} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  authState.user = viewer;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThreadCard vote control", () => {
  it("always shows the up and down arrow around the score", () => {
    renderCard(makeThread());

    expect(screen.getByRole("button", { name: "Hochstimmen" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Runterstimmen" })).toBeVisible();
    expect(screen.getByLabelText("Punktzahl: 5")).toHaveTextContent("+5");
  });

  it("changes the score from the list when the up arrow is clicked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ score: 6, karma: 1, my_vote: 1 }, 200));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderCard(makeThread());
    await user.click(screen.getByRole("button", { name: "Hochstimmen" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Punktzahl: 6")).toHaveTextContent("+6"),
    );
    expect(screen.getByRole("button", { name: "Hochstimmen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const called = fetchMock.mock.calls[0];
    expect(String(called[0])).toBe(`${API_BASE_URL}/api/v1/threads/7/vote`);
    expect(JSON.parse((called[1] as RequestInit).body as string)).toEqual({
      value: 1,
    });
  });

  it("disables both arrows on one's own thread with the reason", () => {
    authState.user = viewer;
    renderCard(makeThread({ author: { ...author, id: viewer.id } }));

    const up = screen.getByRole("button", { name: "Hochstimmen" });
    const down = screen.getByRole("button", { name: "Runterstimmen" });
    expect(up).toBeDisabled();
    expect(down).toBeDisabled();
    expect(up).toHaveAttribute(
      "title",
      "Eigene Inhalte können nicht bewertet werden.",
    );
  });
});
