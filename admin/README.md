# Forum · Admin

Das Admin-Panel der Community-Forum-Plattform: eine eigenständige
Vite-/React-/TypeScript-Anwendung, die gegen dieselbe REST-API arbeitet wie das
Forum, aber als eigener Dienst auf einem eigenen Port läuft. Sie liefert den
Rahmen für Dashboard, Nutzerverwaltung, Kategorienverwaltung, die
Moderations-Warteschlange und das Audit-Log — in derselben Hell-/Dunkel-Optik
wie das Forum.

## Tech-Stack

- Vite, React 18, TypeScript
- React Router (Routen)
- TanStack Query (Server-State)
- Tailwind CSS mit class-basiertem Dark Mode
- Vitest + Testing Library (Tests)

## Installation

```bash
cd admin
npm ci
```

## Starten (Entwicklung)

Das Admin-Panel läuft auf seinem eigenen Port (Standard `5174`) und benötigt
das Forum-Frontend **nicht**:

```bash
cd admin
npm run dev
```

Danach im Browser `http://localhost:5174` öffnen.

Die Adresse der API kommt aus der Umgebungsvariable `VITE_API_BASE_URL`
(Standard: `http://localhost:8000`). Im Betrieb füllt der Runner sie aus
`${service:api.origin}`, sodass kein Port fest verdrahtet ist.

## Build für Produktion

```bash
cd admin
npm run build     # Typprüfung + Build nach dist/
npm run preview   # gebauten Stand lokal ausliefern
```

## Tests

```bash
cd admin
npm test          # Vitest, läuft einmalig und beendet sich
```

## Verwendung

Nach dem Start zeigt der Rahmen oben eine Kopfzeile mit dem Wortzeichen
„Forum · Admin“ (samt rotem „Admin“-Abzeichen zur Abgrenzung vom Forum) und dem
Farbschema-Umschalter. Die Navigation liegt ab 1024 px in einer festen linken
Seitenleiste, darunter als horizontal scrollbare Registerzeile.

Verfügbare Routen:

| Route                | Ansicht          |
| -------------------- | ---------------- |
| `/`                  | leitet auf `/dashboard` um |
| `/dashboard`         | Dashboard        |
| `/users`             | Nutzer           |
| `/categories`        | Kategorien       |
| `/moderation-queue`  | Warteschlange    |
| `/audit-log`         | Audit-Log        |

Der Farbschema-Umschalter wechselt zyklisch **Hell → System → Dunkel** und
richtet sich beim ersten Besuch nach der Systemvoreinstellung. Die Wahl wird in
`localStorage` gespeichert und überlebt damit einen Reload; es wird nie ein
zweites Stylesheet geladen, sondern lediglich die Klasse `dark` am
`<html>`-Element umgeschaltet.

Die Seiten sind in diesem Schritt bewusst als Platzhalter mit der Kennzeichnung
„In Arbeit“ angelegt; die Fachfunktionen folgen in den jeweiligen Tickets.

## API-Anbindung

- `src/api/client.ts` — typisierter `fetch`-Wrapper mit Bearer-Header,
  Decodierung des gemeinsamen Fehler-Umschlags und stillem Refresh über
  `POST /api/v1/auth/refresh`.
- `src/api/types.ts` — die Kontrakt-Typen des Admin-Panels.
- `src/api/admin.ts` — Admin-, Moderations- und Audit-Endpunkte.
- `src/api/auth.ts` — Registrierung, Login, Refresh, Logout und Passwortwechsel.

## Merkmale

- Eigenständige App auf eigenem Port, unabhängig vom Forum startbar.
- Vollständige Route-Tabelle mit gemeinsamem Rahmen und Navigation.
- Hell-/Dunkel-Modus identisch zum Forum, umschaltbar ohne Reload.
- Voll bedienbar bis 360 px Breite.
- Platzhalter-Seiten sind klar als „In Arbeit“ gekennzeichnet.
