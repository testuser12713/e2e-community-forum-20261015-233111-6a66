/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "var(--color-bg)",
          subtle: "var(--color-bg-subtle)",
        },
        surface: {
          DEFAULT: "var(--color-surface)",
          raised: "var(--color-surface-raised)",
        },
        fg: {
          DEFAULT: "var(--color-fg)",
          muted: "var(--color-fg-muted)",
          subtle: "var(--color-fg-subtle)",
        },
        border: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
          active: "var(--color-accent-active)",
          soft: "var(--color-accent-soft)",
          contrast: "var(--color-accent-contrast)",
        },
        danger: {
          DEFAULT: "var(--color-danger)",
          soft: "var(--color-danger-soft)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          soft: "var(--color-success-soft)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          soft: "var(--color-warning-soft)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          soft: "var(--color-info-soft)",
        },
        overlay: "var(--color-overlay)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
