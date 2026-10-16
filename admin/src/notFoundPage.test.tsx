import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const unauthorized = {
  error: { code: "unauthorized", message: "Nicht angemeldet.", details: null },
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "";

  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse(401, unauthorized)),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin not-found page", () => {
  it("renders a centred empty state with icon, title, hint and a dashboard link", () => {
    renderAt("/diese-adresse-gibt-es-nicht");

    const state = screen.getByTestId("empty-state");
    expect(state).toBeInTheDocument();
    expect(state).toHaveClass("items-center", "text-center");

    expect(screen.getByTestId("empty-state-icon").querySelector("svg")).not.toBeNull();

    expect(
      screen.getByRole("heading", { level: 1, name: "Seite nicht gefunden" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Diese Adresse gehört zu keiner Ansicht des Admin-Panels."),
    ).toBeInTheDocument();

    const link = screen.getByRole("link", { name: "Zum Dashboard" });
    expect(link).toHaveAttribute("href", "/dashboard");
  });

  it("never shows the 'In Arbeit' placeholder chip on the not-found page", () => {
    renderAt("/diese-adresse-gibt-es-nicht");
    expect(screen.queryByText("In Arbeit")).not.toBeInTheDocument();
    expect(screen.queryByTestId("placeholder-panel")).not.toBeInTheDocument();
  });
});
