import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Admin dark-mode contrast tokens (DESIGN.md §Colors, §Layout Principles).
 *
 * The admin palette mirrors every light token as a dark twin under `.dark`.
 * `--color-danger-soft` was missing its dark twin, so the error Alert rendered
 * a light-pink surface (#FDECEC) with the near-white dark `--color-fg` on top —
 * an unreadable ~1.05:1. These tests pin the token fix and the required
 * accent-contrast so the deviation cannot silently return.
 */

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

function block(selector: string): string {
  const match = new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\}`).exec(css);
  if (!match) {
    throw new Error(`selector ${selector} not found in index.css`);
  }
  return match[1];
}

function token(selector: string, name: string): string {
  const value = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(
    block(selector),
  );
  if (!value) {
    throw new Error(`--${name} not found in ${selector}`);
  }
  return value[1].toLowerCase();
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x,
  ) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("admin dark-mode tokens", () => {
  it("keeps the approved light danger-soft surface", () => {
    expect(token(":root", "color-danger-soft")).toBe("#fdecec");
  });

  it("gives danger-soft a dark twin that stays readable against the dark fg", () => {
    const darkSoft = token(".dark", "color-danger-soft");
    expect(darkSoft).not.toBe("#fdecec");
    expect(contrast(token(".dark", "color-fg"), darkSoft)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("uses the dark accent label tokens, never white, on dark accent surfaces", () => {
    expect(token(".dark", "color-accent")).toBe("#818cf8");
    expect(token(".dark", "color-accent-contrast")).toBe("#0d1015");
    expect(token(".dark", "color-accent-hover")).toBe("#a5b4fc");
    expect(token(".dark", "color-accent-active")).toBe("#c7d2fe");
    expect(
      contrast(
        token(".dark", "color-accent-contrast"),
        token(".dark", "color-accent"),
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  it("keeps the approved light accent tokens", () => {
    expect(token(":root", "color-accent")).toBe("#4f46e5");
    expect(token(":root", "color-accent-contrast")).toBe("#ffffff");
  });
});
