/**
 * Notification bell — shell slot. The unread panel is a later ticket's work,
 * so the control is rendered visibly disabled and labelled 'In Arbeit'
 * (AC-43) instead of silently doing nothing.
 */
export function NotificationBell() {
  return (
    <button
      type="button"
      className="icon-btn"
      disabled
      aria-label="Benachrichtigungen — In Arbeit"
      title="Benachrichtigungen — In Arbeit"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    </button>
  );
}

export default NotificationBell;
