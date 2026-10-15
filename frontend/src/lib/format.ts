/**
 * The project's single formatter for dates, numbers and scores (DESIGN.md
 * "Formatting contract"): relative timestamps in lists and feeds, absolute
 * dates from 30 days on, German grouped counts and signed scores with the
 * U+2212 minus. Every page and component formats through these helpers so the
 * two apps never hand-build a string.
 */

const COUNT_FORMAT = new Intl.NumberFormat("de-DE");

const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Berlin",
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/Berlin",
});

const MINUS = "\u2212";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY = 60 * 60 * 24;

function toDate(input: string | Date): Date | null {
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** German grouped count without decimals: 1234 -> '1.234'. */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return COUNT_FORMAT.format(value);
}

/** Signed integer score with the U+2212 minus: '+12', '−3', '0'. */
export function formatScore(value: number): string {
  if (value > 0) return `+${formatCount(value)}`;
  if (value < 0) return `${MINUS}${formatCount(Math.abs(value))}`;
  return "0";
}

/** Absolute date 'TT.MM.JJJJ' in Europe/Berlin. */
export function formatAbsoluteDate(input: string | Date): string {
  const date = toDate(input);
  if (!date) return "";
  return DATE_FORMAT.format(date);
}

/** Absolute date with time 'TT.MM.JJJJ, HH:MM' (24-hour, Europe/Berlin). */
export function formatDateTime(input: string | Date): string {
  const date = toDate(input);
  if (!date) return "";
  return DATE_TIME_FORMAT.format(date);
}

/**
 * Relative timestamp for lists and feeds: 'gerade eben', 'vor 5 Min.',
 * 'vor 3 Std.', 'vor 2 Tagen', 'vor 3 Wochen', from 30 days on the absolute
 * date. `now` is injectable so tests are deterministic.
 */
export function formatRelativeTime(
  input: string | Date,
  now: Date = new Date(),
): string {
  const date = toDate(input);
  if (!date) return "";
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < SECONDS_PER_MINUTE) return "gerade eben";
  if (diff < SECONDS_PER_HOUR) {
    return `vor ${Math.floor(diff / SECONDS_PER_MINUTE)} Min.`;
  }
  if (diff < SECONDS_PER_DAY) {
    return `vor ${Math.floor(diff / SECONDS_PER_HOUR)} Std.`;
  }
  const days = Math.floor(diff / SECONDS_PER_DAY);
  if (days < 7) return days === 1 ? "vor 1 Tag" : `vor ${days} Tagen`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "vor 1 Woche" : `vor ${weeks} Wochen`;
  }
  return formatAbsoluteDate(date);
}
