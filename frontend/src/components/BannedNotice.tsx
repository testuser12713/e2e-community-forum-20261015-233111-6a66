import { formatAbsoluteDate } from "../lib/format";

export interface BannedNoticeProps {
  /** The ban reason from the error envelope (or the signed-in user's profile). */
  reason: string | null;
  /** ISO timestamp of when the ban lifts, when one is set. */
  expiresAt?: string | null;
}

/**
 * The non-dismissible ban banner (AC-10, DESIGN.md §Alert/Banner).
 *
 * Reads exactly 'Gesperrt: <Grund>' and appends ' · bis TT.MM.JJJJ' when an
 * expiry exists. A banned user may still read; the surrounding page disables
 * every write control while this notice is shown.
 */
export function BannedNotice({ reason, expiresAt }: BannedNoticeProps) {
  const expiry = expiresAt ? formatAbsoluteDate(expiresAt) : "";

  return (
    <div
      role="alert"
      className="flex items-start gap-3"
      style={{
        position: "sticky",
        top: 56,
        zIndex: 10,
        padding: "12px 16px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-danger)",
        background: "var(--color-danger-soft)",
        color: "var(--color-fg)",
        fontSize: 14,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ flexShrink: 0, marginTop: 3, color: "var(--color-danger)" }}
      >
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      <span>
        Gesperrt: {reason ?? "Ohne Grund"}
        {expiry ? ` · bis ${expiry}` : ""}
      </span>
    </div>
  );
}

export default BannedNotice;
