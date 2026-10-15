# Design — Project Identity

> This document is project-long-lived. Tokens are not changed without
> the Architect's approval. Developers MUST use these tokens
> instead of improvising their own colors/spacings.

## Style Direction

Calm, content-first community UI in the Linear/Stripe tradition: neutral surfaces, a single indigo accent, dense but airy Inter typography, and one systematically mirrored palette for light and dark mode — readable thread lists, legible comment trees, sober admin tables.

## Colors

- `--color-bg`: **#FFFFFF**
- `--color-bg-subtle`: **#F6F7F9**
- `--color-surface`: **#FFFFFF**
- `--color-surface-raised`: **#FFFFFF**
- `--color-fg`: **#15171C**
- `--color-fg-muted`: **#636B78**
- `--color-fg-subtle`: **#8A919E**
- `--color-border`: **#E3E6EB**
- `--color-border-strong`: **#C9CFD8**
- `--color-accent`: **#4F46E5**
- `--color-accent-hover`: **#4338CA**
- `--color-accent-active`: **#3730A3**
- `--color-accent-soft`: **#EEF0FF**
- `--color-accent-contrast`: **#FFFFFF**
- `--color-upvote`: **#4F46E5**
- `--color-downvote`: **#64748B**
- `--color-success`: **#157F3D**
- `--color-success-soft`: **#E7F6EC**
- `--color-warning`: **#B45309**
- `--color-warning-soft`: **#FDF3E3**
- `--color-danger`: **#DC2626**
- `--color-danger-soft`: **#FDECEC**
- `--color-info`: **#0369A1**
- `--color-info-soft`: **#E6F2F9**
- `--color-overlay`: **rgba(15,17,22,0.45)**
- `--color-dark-bg`: **#0D1015**
- `--color-dark-bg-subtle`: **#14181F**
- `--color-dark-surface`: **#171B23**
- `--color-dark-surface-raised`: **#1D222B**
- `--color-dark-fg`: **#E8EBF0**
- `--color-dark-fg-muted`: **#9BA4B3**
- `--color-dark-fg-subtle`: **#737D8C**
- `--color-dark-border`: **#262C36**
- `--color-dark-border-strong`: **#39414E**
- `--color-dark-accent`: **#818CF8**
- `--color-dark-accent-hover`: **#A5B4FC**
- `--color-dark-accent-active`: **#C7D2FE**
- `--color-dark-accent-soft`: **#232A4D**
- `--color-dark-accent-contrast`: **#0D1015**
- `--color-dark-upvote`: **#818CF8**
- `--color-dark-downvote`: **#7C8797**
- `--color-dark-success`: **#4ADE80**
- `--color-dark-warning`: **#FBBF24**
- `--color-dark-danger`: **#F87171**
- `--color-dark-info`: **#38BDF8**

## Spacing Scale

- `--space-0`: 4px
- `--space-1`: 8px
- `--space-2`: 12px
- `--space-3`: 16px
- `--space-4`: 24px
- `--space-5`: 32px
- `--space-6`: 48px
- `--space-7`: 64px

## Components

### Button

Variants: primary (bg=accent, label=accent-contrast), secondary (bg=surface, 1px border=border, label=fg; hover border=border-strong, bg=bg-subtle), ghost (transparent, label=fg-muted; hover bg=accent-soft, label=fg), danger (bg=danger, label=#FFFFFF). Geometry: min-height 44px (touch target on all breakpoints), padding 10px 18px, radius md, font 15px/600, gap 8px between icon and label, icon 18px. States: default; hover primary bg=accent-hover, secondary/danger darken as above, transition 120ms ease-out on background-color and border-color; active primary bg=accent-active + transform translateY(1px); focus-visible outline 2px accent, outline-offset 2px (never removed); disabled opacity 0.5, cursor not-allowed, no hover change; loading replaces label with a 16px spinner and keeps the button width, still disabled. Never a button that silently does nothing: if the action is unimplemented, render it disabled with the label suffix '— In Arbeit'.

### IconButton

44x44px hit area, radius md, icon 20px centered, transparent background; hover bg=bg-subtle; active bg=accent-soft; focus ring as Button; disabled opacity 0.4. Used for bell, theme toggle, comment actions, admin row menus. Always carries an aria-label in German.

### Input / Textarea

Height 44px (single line), textarea min-height 120px auto-growing, padding 10px 12px, bg=surface, 1px border=border, radius md, font 15px/1.5, placeholder fg-subtle. Focus: border=accent + 2px ring rgba(79,70,229,0.28). Error: border=danger + ring rgba(220,38,38,0.22). Disabled: bg=bg-subtle, opacity 0.6. Character counter for bio (500 max) bottom-right in 13px fg-muted, turns danger past the limit.

### FieldError

13px/18px, color=danger, margin-top 4px, role=alert. Rendered ONLY after the field was blurred or the form was submitted (AC-44) — an untouched form shows no error text. Server validation errors from the shared error envelope map to the matching field by `details[].field`; non-field errors go to the form-level Alert.

### Alert / Banner

Full-width block, padding 12px 16px, radius md, 1px border in the matching tone, 16px leading icon. Tones: error (bg=danger-soft, border=danger, text=fg), success (success-soft), warning (warning-soft), info (info-soft). The ban banner is sticky under the header and reads exactly 'Gesperrt: <Grund>' plus ' · bis TT.MM.JJJJ' when an expiry exists; it is non-dismissible and survives navigation.

### Card

bg=surface, 1px border=border, radius lg, padding 16px (mobile) / 24px (>=768px). Raised variant (bg=surface-raised, shadow 0 1px 2px rgba(15,17,22,0.06), 0 8px 24px rgba(15,17,22,0.06)) for modals and dropdown panels only. Cards are never nested more than one level deep.

### ThreadListItem

Row inside a list card, padding 16px, 1px divider=border between rows, radius 0 (first/last row inherit the card radius). Left: VoteControl column 40px wide. Right: title 17px/600 (max 2 lines, ellipsis), then a meta line in 13px fg-muted: Kategorie · Autor · Zeit · 'Kommentare: N'. Title hover color=accent and underline on hover only. Threads that are locked or removed show a badge before the title; pinned threads additionally get bg=accent-soft and stay above the sorted list. Whole row is keyboard-focusable (tabindex 0, Enter opens) with the same focus ring as Button.

### VoteControl

Vertical stack, width 40px: up arrow 32x32, score 15px/600 tabular-nums, down arrow 32x32; touch targets padded to 44px on mobile via a transparent hit area. Idle icon color=fg-muted. Upvoted: icon+bg=accent (dark: dark-accent), filled triangle, score color=accent. Downvoted: icon+bg=downvote, score color=downvote. Same value clicked twice clears the vote. Own content: both arrows disabled (opacity 0.4, cursor not-allowed) with title 'Eigene Inhalte können nicht bewertet werden'. Banned users: disabled with tooltip carrying the ban reason. Score updates in place, no layout shift (fixed 20px line box, tabular-nums).

### CommentNode

Indent 20px per level, max depth 5 (level 6 is rejected server-side with 400 — the UI never offers a reply button deeper than level 5). Levels 1-5 get a 2px left border=border guide line, md radius-free. Header line 13px fg-muted: Autor (link, weight 500), Rolle badge if not user, Zeit, 'Bearbeitet' appended after the timestamp when edited_at is set. Body 16px/26px, max-width 68ch. Meta action row (Antworten, Melden, Bearbeiten, Löschen, moderator actions) as ghost IconButtons, revealed on hover/focus but always reachable by keyboard. Deleted node: body replaced by '[gelöscht]' in fg-subtle italic, replies stay visible and keep their indent. Removed by moderator: same treatment plus badge 'Entfernt'. Collapse toggle on the guide line ('− N Antworten').

### MarkdownEditor

Tab bar with 'Schreiben' and 'Vorschau' (segmented control, active tab bg=accent-soft, label=accent, 44px high). Write tab: monospace textarea, font 14px/1.6, min-height 200px, radius md, resizable vertically. Preview tab renders the server-sanitised HTML in the exact thread-body typography (16px/26px): headings 20px/600, inline code and code blocks bg=bg-subtle + mono, blockquotes 3px left border=accent-soft, links accent + underline, lists 24px indent. Toolbar (bold, italic, link, code, list) as ghost IconButtons; if a formatting action is not implemented it is disabled and labelled 'In Arbeit'. Rate-limit state: below the editor an inline warning with a live countdown, 'Zu viele Beiträge – erneut in 42 s', and the submit Button disabled until it reaches 0.

### Tag / Chip

Inline-flex, height 24px, padding 0 10px, radius pill, 12px/500. Variants: neutral (bg=bg-subtle, border=border, text=fg-muted), accent (bg=accent-soft, text=accent), success, warning, danger. Tags are clickable filters — hovering raises border to accent and text to accent. Removal chips (category filter) carry a 16px x icon with a 32px hit area.

### Badge

Same geometry as Tag, used for status, never interactive. Role: user = neutral, moderator = info-soft/info with label 'Moderator', admin = accent-soft/accent with label 'Admin'. Content status: 'Angepinnt' (accent icon pin), 'Gesperrt' (warning, lock icon), 'Abonniert' (accent), 'Entfernt' (danger), 'In Arbeit' (neutral, dashed border, disabled controls only).

### SortTabs

Segmented control, height 40px, radius md, track bg=bg-subtle with 1px border=border: three tabs 'Neu', 'Top', 'Hot', each padding 0 16px, 14px/500 fg-muted; active tab bg=surface, shadow 0 1px 2px rgba(15,17,22,0.08), label fg. Keyboard: arrow keys move, roving tabindex, role=tablist/tab. On 360px the three tabs stay on one row and scroll horizontally without visible scrollbar.

### Pagination

Right-aligned row, gap 8px: 'Zurück' and 'Weiter' buttons (secondary, disabled at the ends) plus up to 5 numbered page buttons at 36x36px (44x44px below 768px), radius md; current page bg=accent, label=accent-contrast, aria-current=page; ellipsis as plain fg-muted text. Companion line above the list in 13px fg-muted: 'Seite 2 von 7 · 132 Einträge'. A page beyond the last renders the EmptyState instead of an error.

### AppHeader

Sticky, height 56px, bg=surface with 1px bottom border=border (dark: dark-surface). Left: product wordmark — forum 'Forum' with the accent square mark, admin 'Forum · Admin' with the same mark plus a danger-coloured 'Admin' chip so the two apps on different ports are never confused. Center (>=768px): search field 320px wide, height 36px, radius pill. Right: notification bell, theme toggle, avatar menu (24px radius circle, menu items 40px high: Profil, Einstellungen, Abmelden). On 360px the search collapses to an IconButton and the header stays 56px.

### NotificationBell

IconButton with a 20px bell; unread count badge top-right, min-width 18px, height 18px, radius pill, bg=accent, label=accent-contrast, 11px/600; hidden at 0, capped display '99+'. Panel: anchored dropdown, width min(360px, calc(100vw - 32px)), radius lg, raised card, max-height 70vh scrollable. Items 64px high: 13px text, unread items bg=accent-soft with a 6px accent dot on the left, read items plain. Header row 'Benachrichtigungen' + text button 'Alle als gelesen markieren'. Empty state: 'Keine Benachrichtigungen' 13px fg-muted.

### ThemeToggle

IconButton cycling Hell → System → Dunkel, icon sun/monitor/moon, aria-label 'Farbschema: Hell/System/Dunkel'. Applies or removes class='dark' on <html> without a reload and writes the choice to localStorage; on first visit the system preference decides. Both apps ship the identical component and the identical token names so the modes match pixel-for-pixel.

### Modal / Dialog

Overlay bg=overlay, panel width min(480px, calc(100vw - 32px)), radius lg, raised card, padding 24px, optional header 20px/600 and footer row with secondary+primary buttons right-aligned. ESC and overlay click close (unless the action is destructive and unsaved), focus is trapped, focus returns to the trigger, page scroll locked. Mobile: panel docks to the bottom sheet style with radius lg top corners. Used for Melden, Löschen bestätigen, Rolle ändern, Sperren.

### DropdownMenu

Trigger is an IconButton (kebab); panel anchored, min-width 200px, radius md, raised card, padding 4px. Items height 40px, padding 0 12px, 14px, icon 16px + 8px gap; hover/focus bg=bg-subtle. Destructive items (Entfernen, Sperren, Löschen) in danger tone. Disabled items are visibly greyed with the suffix 'In Arbeit'. Moderator action menu carries 'Anheften/Angepinnt lösen', 'Sperren/Entsperren', 'Verschieben', 'Entfernen'.

### ReportFlow

Dialog from the content meta row: select 'Grund' (Spam, Beleidigung, Spam-Link, Sonstiges) as 44px-tall options, optional textarea 'Notiz (optional)' max 500 characters, submit primary 'Meldung senden'. Success replaces the dialog content with a 16px/600 'Danke, die Meldung liegt in der Warteschlange'. A 409 duplicate from the API renders as a form-level Alert 'Du hast diesen Inhalt bereits gemeldet.' and leaves the dialog open.

### DataTable (admin)

Card-wrapped table, sticky header row height 40px, bg=bg-subtle, labels 12px/500 uppercase letter-spacing 0.02em color=fg-muted, sortable columns carry a 14px arrow (accent when active). Rows height 48px, 1px divider=border, hover bg=bg-subtle, cell padding 12px 16px, 14px text; identifiers (username, e-mail) in weight 500. Actions live in the row's DropdownMenu. Below 768px each row collapses into a stacked definition list, labels on the left in fg-muted. Includes a search field (320px, pill) plus the shared Pagination.

### StatCard (admin dashboard)

Grid of 6 cards, min-width 200px, gap 16px, padding 20px, radius lg. Value 28px/600 tabular-nums fg, label 13px fg-muted above, optional 7-day delta in 12px success/danger with an arrow. Values must match GET /admin/stats exactly — one shared number formatter for the admin app.

### ModerationQueueItem

Card, padding 16px: header line 'Meldung · Grund' + timestamp 13px fg-muted, then the reported content in a 68ch block with a 3px left border=warning, then reporter and target author 13px fg-muted, then actions 'Inhalt entfernen' (danger secondary) and 'Meldung verwerfen' (secondary). After either action the item animates out (120ms) and a Toast confirms 'Erledigt – Audit-Eintrag geschrieben'. Pending state greys both buttons.

### EmptyState

Centered block, padding 48px 24px: 32px line icon in fg-subtle, title 16px/600, hint 13px fg-muted (max 2 lines), optional secondary button. Used for empty lists, empty search results ('Keine Treffer für "<Begriff>"'), empty notification panel, empty moderation queue and out-of-range pages.

### Skeleton

Placeholder rows mirroring the target layout: bg=bg-subtle, radius sm, shimmer 1.2s linear infinite, opacity pulsing 0.6→1. Used for thread lists, thread detail, admin tables; never as a permanent state — after 8s the skeleton is replaced by an EmptyState or an error Alert.

### Toast

Fixed bottom-right on >=768px (bottom-center, full width minus 16px gutters, on 360px), width 320px, radius md, raised card, padding 12px 16px, 3px left border in the tone colour, message 14px, auto-dismiss 5s, manual close IconButton. role=status, aria-live=polite; a single toast at a time, a new one replaces the old. Used for 'Meldung gesendet', 'Als gelesen markiert', 'Kategorie gespeichert'.

### UserCard / ProfileHeader

Coverless header block, padding 24px, radius lg: 64px avatar circle (fallback = initials on accent-soft, initials 20px/600 accent), display name 24px/600, '@username' 13px fg-muted, role badge, karma as a separate labelled tile ('Karma' 13px fg-muted / value 20px/600), bio 15px/24px max 68ch. 'Profil bearbeiten' button only on one's own profile. Below: two SortTabs 'Threads' and 'Kommentare' with their own paginated lists. Unknown username -> 404 page with EmptyState 'Nutzer nicht gefunden'.

## Layout Principles

- Light and dark mode are one system, not two designs: every colour above exists as a light value and a `dark-` twin with the same role; the app toggles class='dark' on <html>, never a second stylesheet. Minimum contrast: 4.5:1 for body text, 3:1 for large text, icons and UI borders in BOTH modes; accent on dark is always the lighter indigo (#818CF8), never #4F46E5.
- Forum container: max-width 1120px, horizontally centred, page padding 16px below 768px and 24px above. Thread detail is a two-column layout from 1024px: 760px content column (comment tree reads at max 68ch) + 320px sticky sidebar (category nav, subscribe button, thread meta); below 1024px the sidebar stacks below the comment tree, 24px apart.
- Admin panel: full-width shell — fixed 240px left sidebar (Dashboard, Nutzer, Kategorien, Warteschlange, Audit-Log) at >=1024px; below that the sidebar becomes a horizontal scrollable tab row under the 56px header. Admin content area max-width 1440px with 24px padding; tables scroll horizontally rather than shrinking below readable column widths.
- Breakpoints (Tailwind, mobile-first): 360px is the hard minimum and must never scroll horizontally, 640px sm, 768px md, 1024px lg, 1280px xl. Every screen is checked at 360, 768, 1024 and 1440.
- Vertical rhythm: 8px base unit, 24px between page sections, 32px between major blocks (header, filter bar, list, pagination), 16px inside cards. Headings are followed by 8-12px, never by a hard rule line — separation comes from spacing and borders, not from extra colours.
- Focus and keyboard: every interactive element gets a visible 2px accent ring with 2px offset on :focus-visible, never suppressed; tab order follows visual order; menus, dialogs and dropdowns trap focus and restore it to the trigger; all states (hover, disabled) are also reachable without a pointer.
- Motion: functional only — 120ms ease-out on colour/border/shadow changes, 160ms on panel and dialog entry, and always wrapped in prefers-reduced-motion: reduce. No parallax, no decorative animation, no auto-playing motion near the comment tree.
- Content-first chrome: maximum two font sizes per row, headings never larger than 24px inside a list, no coloured backgrounds behind body text, and colour reserved for meaning (accent = action/selection, warning = lock/pin, danger = destructive or banned, success = confirmation). Everything else uses fg, fg-muted and border.
- Formatting contract — ONE format for every date, time, duration and amount in both apps and both modes, produced by one shared formatter per project (never hand-built strings): relative timestamps in lists and feeds — 'gerade eben', 'vor 5 Min.', 'vor 3 Std.', 'vor 2 Tagen', 'vor 3 Wochen'; from 30 days on, the absolute date. Absolute date 'TT.MM.JJJJ', date with time 'TT.MM.JJJJ, HH:MM' (24-hour clock, Europe/Berlin). Durations and expiries are absolute and spelled out: 'bis 14.03.2026', '30 Tage'. Numbers use German grouping and no decimals for counts: '1.234', '10.000', comments as 'Kommentare: 132'. Scores and karma are signed integers with tabular-nums: '+12', '−3' (U+2212), '0'. Counters that only ever grow are written without a sign.
- Loading, empty and error states are designed, not improvised: every list has a Skeleton, then either content, an EmptyState or an Alert with the message from the shared error envelope, in that order of precedence — a page beyond the last shows an EmptyState with 200, never an error (AC-19, AC-37).
- No control is decoration: anything rendered as tappable works or is visibly disabled and labelled 'In Arbeit' (AC-43), and every form starts neutral, showing validation feedback only after the field was touched or the form was submitted (AC-44).
