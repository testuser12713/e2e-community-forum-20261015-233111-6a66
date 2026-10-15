import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { VoteButtons, formatScore, type VoteButtonsProps } from "./VoteButtons";
import { API_BASE_URL, setAccessToken } from "../api/client";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderVote(props: VoteButtonsProps) {
  return render(
    <MemoryRouter initialEntries={["/t/1"]}>
      <VoteButtons {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  setAccessToken(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("formatScore", () => {
  it("signs positive and negative scores and leaves zero plain", () => {
    expect(formatScore(0)).toBe("0");
    expect(formatScore(12)).toBe("+12");
    expect(formatScore(-3)).toBe("\u22123");
  });
});

describe("VoteButtons", () => {
  it("up-votes a thread, updates the score and marks the button", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ score: 6, karma: 1, my_vote: 1 }, 200),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderVote({
      targetType: "thread",
      targetId: 7,
      score: 5,
      value: 0,
    });

    expect(screen.getByLabelText("Punktzahl: 5")).toHaveTextContent("+5");

    const up = screen.getByRole("button", { name: "Hochstimmen" });
    expect(up).toHaveAttribute("aria-pressed", "false");

    await user.click(up);

    await waitFor(() =>
      expect(screen.getByLabelText("Punktzahl: 6")).toHaveTextContent("+6"),
    );
    expect(screen.getByRole("button", { name: "Hochstimmen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const called = fetchMock.mock.calls[0];
    expect(String(called[0])).toBe(`${API_BASE_URL}/api/v1/threads/7/vote`);
    expect((called[1] as RequestInit).method).toBe("POST");
    expect(JSON.parse((called[1] as RequestInit).body as string)).toEqual({
      value: 1,
    });
  });

  it("removes the vote on a second click on the same direction", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ score: 6, karma: 1, my_vote: 1 }, 200))
      .mockResolvedValueOnce(jsonResponse({ score: 5, karma: 0, my_vote: 0 }, 200));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderVote({
      targetType: "comment",
      targetId: 3,
      score: 5,
      value: 0,
    });

    const up = screen.getByRole("button", { name: "Hochstimmen" });
    await user.click(up);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Hochstimmen" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );

    await user.click(screen.getByRole("button", { name: "Hochstimmen" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Punktzahl: 5")).toHaveTextContent("+5"),
    );
    expect(screen.getByRole("button", { name: "Hochstimmen" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      `${API_BASE_URL}/api/v1/comments/3/vote`,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the score and shows the message on a 400 for own content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "own_content",
            message: "Eigene Inhalte können nicht bewertet werden.",
            details: null,
          },
        },
        400,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderVote({
      targetType: "thread",
      targetId: 9,
      score: 5,
      value: 0,
    });

    await user.click(screen.getByRole("button", { name: "Hochstimmen" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Eigene Inhalte können nicht bewertet werden.",
      ),
    );
    expect(screen.getByLabelText("Punktzahl: 5")).toHaveTextContent("+5");
    expect(screen.getByRole("button", { name: "Hochstimmen" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
