// End-to-end suite for the forum frontend (Vite + React).
//
// It drives the real application in a real browser and checks the behaviour a
// user observes: the shell, navigation between every screen, the sign-in and
// registration forms, the search filters, the light/dark theme and the
// responsive layout. Console errors and uncaught exceptions are checked after
// every interaction. API-backed lists are asserted only through their wired
// states (loading / empty / error), because the API contract is served by the
// `api` service and verified by its own suite.

const { test, expect } = require("@playwright/test");

// Scratch space for the console/page errors of one test.
let errors = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // Ignore browser-level resource noise (a missing favicon, a refused
    // connection). Real JavaScript failures surface as a `pageerror`.
    if (/favicon|net::ERR_|Failed to load resource/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
});

test.afterEach(async () => {
  expect(errors, `unexpected console/page errors:\n${errors.join("\n")}`).toEqual([]);
});

test.describe("app shell", () => {
  test("start page renders the shell, navigation and the feed region", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: /Forum – Startseite/i }),
    ).toBeVisible();

    const nav = page.getByRole("navigation", { name: "Hauptnavigation" });
    await expect(nav.getByRole("link", { name: "Startseite" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Suche" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Neuer Thread" })).toBeVisible();

    await expect(
      page.getByRole("heading", { level: 1, name: "Startseite" }),
    ).toBeVisible();

    // Not signed in: the shell offers sign-in and registration.
    await expect(page.getByRole("link", { name: "Anmelden" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Registrieren" })).toBeVisible();

    // The feed resolves to one of its states (list, empty state or error),
    // never to a blank page.
    await expect(
      page
        .getByRole("list")
        .or(page.getByRole("status"))
        .or(page.getByRole("alert"))
        .first(),
    ).toBeVisible();
  });

  test("every navigation entry leads to its screen", async ({ page }) => {
    await page.goto("/");

    await page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("link", { name: "Suche" })
      .click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole("heading", { level: 1, name: "Suche" })).toBeVisible();

    // "Neuer Thread" is gated behind authentication: an anonymous visitor is
    // sent to the sign-in form.
    await page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("link", { name: "Neuer Thread" })
      .click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: "Anmelden" })).toBeVisible();

    await page.goto("/");
    await page.getByRole("link", { name: "Registrieren" }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Registrieren" }),
    ).toBeVisible();
  });

  test("each implemented screen resolves to its real route, never a placeholder", async ({
    page,
  }) => {
    // These routes are implemented now, so this walks the real screen each one
    // renders instead of the build-phase "In Arbeit" placeholder.
    //
    // /new is the thread editor and is gated behind authentication, exactly
    // like /settings: an anonymous visitor is sent to the real sign-in screen.
    await page.goto("/new");
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Anmelden" }),
    ).toBeVisible();

    // /t/:id and /u/:username are API-backed thread and profile screens. With
    // the API absent, or with an id/username that does not exist, each still
    // resolves to its own real wired state — the not-found region or the error
    // region — and never to the placeholder.
    await page.goto("/t/42");
    await expect(
      page.getByText("Thread nicht gefunden").or(page.getByRole("alert")).first(),
    ).toBeVisible();

    await page.goto("/u/alice");
    await expect(
      page.getByText("Nutzer nicht gefunden").or(page.getByRole("alert")).first(),
    ).toBeVisible();

    // /settings is gated behind authentication: an anonymous visitor lands on
    // the real sign-in screen.
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Anmelden" }),
    ).toBeVisible();

    // /notifications is reachable anonymously and renders its real screen with
    // the sign-in prompt.
    await page.goto("/notifications");
    await expect(
      page.getByRole("heading", { level: 1, name: "Benachrichtigungen" }),
    ).toBeVisible();
    await expect(page.getByText("Anmeldung erforderlich")).toBeVisible();
  });

  test("an unknown address renders the not-found screen", async ({ page }) => {
    await page.goto("/this-address-does-not-exist");
    await expect(
      page.getByRole("heading", { level: 1, name: "Seite nicht gefunden" }),
    ).toBeVisible();
  });
});

test.describe("authentication forms", () => {
  test("the sign-in form stays neutral until submitted", async ({ page }) => {
    await page.goto("/login");

    const submit = page.getByRole("button", { name: "Anmelden" });
    await expect(submit).toBeVisible();
    // Untouched: no validation feedback yet.
    await expect(page.getByRole("alert")).toHaveCount(0);

    await submit.click();
    await expect(page.getByText("Bitte Benutzername oder E-Mail angeben.")).toBeVisible();
    await expect(page.getByText("Bitte Passwort angeben.")).toBeVisible();
  });

  test("the registration form validates the contract password rules", async ({
    page,
  }) => {
    await page.goto("/register");

    await page.getByLabel("Benutzername").fill("qa");
    await page.getByLabel("E-Mail").fill("qa@example.test");
    await page.getByLabel("Passwort").fill("short");

    await page.getByRole("button", { name: "Registrieren" }).click();

    await expect(
      page.getByText("Der Benutzername muss mindestens 3 Zeichen haben."),
    ).toBeVisible();
    await expect(
      page.getByText("Das Passwort muss mindestens 12 Zeichen haben."),
    ).toBeVisible();
  });

  test("the two auth screens link to each other", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Jetzt registrieren" }).click();
    await expect(page).toHaveURL(/\/register$/);

    await page.getByRole("link", { name: "Anmelden" }).first().click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("search filters", () => {
  test("typing a term puts it in the URL and offers the category filter", async ({
    page,
  }) => {
    await page.goto("/search");

    await expect(
      page.getByRole("heading", { level: 1, name: "Suche" }),
    ).toBeVisible();

    await page.getByRole("searchbox").fill("react");
    await expect(page).toHaveURL(/[?&]q=react/);

    await expect(page.getByLabel("Kategorie")).toBeVisible();
    await expect(page.getByRole("button", { name: "Suchen" })).toBeVisible();
  });
});

test.describe("theme", () => {
  test("the toggle switches the theme without a reload and survives a reload", async ({
    page,
  }) => {
    await page.goto("/");

    const toggle = page.getByRole("button", { name: /Farbschema/i });
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("forum.theme")))
      .toBe("dark");

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

test.describe("responsive layout", () => {
  test("the app stays usable at 360 px width", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    await page.goto("/");

    await expect(
      page.getByRole("link", { name: /Forum – Startseite/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Startseite" }),
    ).toBeVisible();

    await page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("link", { name: "Suche" })
      .click();
    await expect(page).toHaveURL(/\/search$/);
  });
});
