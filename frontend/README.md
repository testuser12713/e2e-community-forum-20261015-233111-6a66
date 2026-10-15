# Forum — Frontend (web)

Das Forum-Frontend ist eine eigenständige **Vite + React 18 + TypeScript**-App
für die Community-Plattform. Sie spricht ausschließlich über die REST-API
(`/api/v1`) mit dem Backend und läuft auf einem eigenen Port (`5173`), getrennt
vom Admin-Panel.

Dieses Repository-Ticket legt das **Gerüst (Shell)** an: den App-Rahmen mit
Navigation, Theme-Umschaltung, Sitzungsverwaltung und den vollständigen
Routentisch. Die einzelnen Seiten und Komponenten sind bewusst als Platzhalter
markiert (**„In Arbeit“**) — sie werden von den Feature-Tickets gefüllt.

## Tech-Stack

- **Vite** als Build-Tool und Dev-Server
- **React 18** + **TypeScript**
- **React Router** für das Routing
- **TanStack Query** für Server-Zustand
- **Tailwind CSS** mit klassenbasiertem Dark Mode (`darkMode: "class"`)
- **Vitest** + **Testing Library** für Tests
- Design-Tokens und Komponenten-Klassen aus `DESIGN.md` in `src/index.css`

## Installation

```bash
cd frontend
npm install
```

## Entwicklung starten

```bash
cd frontend
npm run dev
```

Danach `http://localhost:5173` im Browser öffnen.

Die Adresse der API wird über die Umgebungsvariable `VITE_API_BASE_URL`
gesetzt. Ohne gesetzten Wert verwendet die App `http://localhost:8000` als
Standard, damit das Gerüst auch ohne laufendes Backend startet.

## Produktions-Build

```bash
cd frontend
npm run build     # erzeugt dist/
npm run preview   # serviert den Build lokal
```

## Tests

```bash
cd frontend
npm test
```

Die Tests prüfen das Shell: dass der App-Rahmen samt Navigation rendert, dass
jede Route ihren Platzhalter auflöst, dass die Theme-Umschaltung ohne Neuladen
funktioniert und ein Neuladen übersteht, und dass der API-Client nach einem
abgelaufenen Token einmal still nachlädt (Refresh) und die ursprüngliche
Anfrage wiederholt.

## Verwendung

Die App folgt dem System-Farbschema und startet in Hell oder Dunkel. Über die
Umschaltung in der Kopfzeile wechselt man zyklisch **Hell → System → Dunkel**;
die Wahl wird im `localStorage` gespeichert und überlebt ein Neuladen.

Vollständiger Routentisch:

| Route            | Seite               | Zweck                                  |
| ---------------- | ------------------- | -------------------------------------- |
| `/`              | Startseite          | Thread-Liste des Forums                |
| `/c/:slug`       | Kategorie           | Threads einer Kategorie                |
| `/t/:id`         | Thread              | Thread-Detail mit Kommentaren          |
| `/t/:id/edit`    | Thread bearbeiten   | Editor für einen bestehenden Thread    |
| `/new`           | Thread erstellen    | Editor für einen neuen Thread          |
| `/search`        | Suche               | Volltextsuche mit Kategorie-/Tag-Filter |
| `/u/:username`   | Profil              | Öffentliches Profil eines Nutzers      |
| `/settings`      | Einstellungen       | Konto und Profil bearbeiten            |
| `/notifications` | Benachrichtigungen  | Liste aller Benachrichtigungen         |
| `/login`         | Anmelden            | Anmeldung                              |
| `/register`      | Registrieren        | Registrierung                          |

Alle anderen Adressen zeigen eine „Seite nicht gefunden“-Ansicht.

## Funktionsumfang (Gerüst)

- App-Rahmen (`Layout`) mit Kopfzeile (`Navbar`), Produkt-Wortmarke, Navigation,
  aktivem Nutzerbereich und Abmelden
- Theme-Umschaltung, die das System-Farbschema übernimmt und die Wahl speichert
- Sitzungsverwaltung (`AuthContext`) auf Basis des API-Clients
- Typpisierter API-Client mit Bearer-Header, Fehler-Envelope und stillem
  Token-Refresh bei `401`
- API-Module für alle Endpunkte des Vertrags (Auth, Nutzer, Kategorien, Threads,
  Kommentare, Votes, Suche, Abos, Benachrichtigungen, Meldungen, Moderation,
  Admin)
- Vollständiger Routentisch mit Platzhalterseiten
- Gemeinsame Komponenten (`MarkdownView`, `MarkdownEditor`, `VoteButtons`,
  `Pagination`, `ThreadCard`, `CommentTree`, `CommentComposer`,
  `NotificationBell`, `SubscribeButton`, `ReportDialog`, `ModerationMenu`) als
  Platzhalter
- Bedienbar bis 360 px Breite ohne horizontales Scrollen
