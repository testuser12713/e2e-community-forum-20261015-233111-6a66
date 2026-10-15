import { useTheme, type ThemeMode } from "../context/ThemeContext";

const LABELS: Record<ThemeMode, string> = {
  light: "Hell",
  system: "System",
  dark: "Dunkel",
};

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export default function ThemeToggle() {
  const { mode, cycle } = useTheme();
  const label = LABELS[mode];

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Farbschema: ${label}`}
      title={`Farbschema: ${label}`}
      className="inline-flex h-11 w-11 items-center justify-center rounded-md text-fg-muted transition-colors duration-100 hover:bg-bg-subtle hover:text-fg"
    >
      {mode === "light" && <SunIcon />}
      {mode === "system" && <MonitorIcon />}
      {mode === "dark" && <MoonIcon />}
    </button>
  );
}
