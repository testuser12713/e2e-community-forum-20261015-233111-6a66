import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("admin shell", () => {
  it("renders the app frame with navigation", async () => {
    renderAt("/dashboard");
    expect(screen.getByText("Forum · Admin")).toBeInTheDocument();
    for (const label of [
      "Dashboard",
      "Nutzer",
      "Kategorien",
      "Warteschlange",
      "Audit-Log",
    ]) {
      expect(
        screen.getAllByRole("link", { name: label }).length,
      ).toBeGreaterThan(0);
    }
    expect(
      await screen.findByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["/users", "Nutzer"],
    ["/moderation-queue", "Warteschlange"],
    ["/audit-log", "Audit-Log"],
  ])("route %s resolves to its placeholder", async (path, title) => {
    renderAt(path);
    expect(
      await screen.findByRole("heading", { level: 1, name: title }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("placeholder-panel")).toBeInTheDocument();
    expect(screen.getByText("In Arbeit")).toBeInTheDocument();
  });

  it("redirects the root path to the dashboard", async () => {
    renderAt("/");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
  });
});

describe("theme toggle", () => {
  it("switches without a reload and survives one", async () => {
    const user = userEvent.setup();

    const first = renderAt("/dashboard");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    const toggle = screen.getByRole("button", { name: /Farbschema/ });
    await user.click(toggle);

    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    );
    expect(localStorage.getItem("theme")).toBe("dark");

    first.unmount();

    renderAt("/dashboard");
    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    );
  });
});
