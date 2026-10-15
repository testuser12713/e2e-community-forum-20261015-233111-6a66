# Community-Forum

Ein Community-Forum als vierteiliges Produkt auf PostgreSQL: eine REST-API auf
FastAPI (dieser Dienst), ein eigener Worker-Prozess für Hintergrundjobs, ein
Vite/React-Forum und ein separates Admin-Panel. Nutzer registrieren sich mit
Argon2id-Passwörtern und rotierenden Refresh-Tokens, schreiben Threads und
verschachtelte Kommentare, stimmen ab (Votes und Karma), abonnieren Threads,
werden per Erwähnung benachrichtigt und können Inhalte melden. Moderator:innen
und Administrator:innen heften an, sperren, verschieben, entfernen und arbeiten
eine Moderations-Warteschlange mit Audit-Log ab; das Admin-Panel liefert
Dashboard, Nutzerverwaltung, Kategorien und Audit-Log. Dieses Repository
enthält den Dienst `api` (Verzeichnis `backend/`), derzeit als Skeleton: er
stellt die vollständige Vertrags-Routen-Tabelle bereit, jede Route antwortet
jedoch noch mit `501 Not Implemented`, bis das jeweilige Feature-Ticket sie
füllt.

## Tech-Stack

- **api** (`backend/`): Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2.0,
  Alembic, psycopg 3, argon2-cffi, PyJWT, markdown-it-py + nh3
- **Datenbank**: PostgreSQL 18 (einzige Datenbank; kein SQLite, auch nicht in
  Tests)
- **Tests**: pytest + FastAPI `TestClient` gegen echtes PostgreSQL

## Voraussetzungen

- Python 3.12 oder neuer
- PostgreSQL 18 (lokal über Docker oder als vorhandener Server)

## Installation

```bash
# Datenbank starten (Docker)
docker compose up -d

# Abhängigkeiten der API installieren
cd backend
python -m pip install -r requirements.txt
```

## Konfiguration

Alle Einstellungen kommen aus Umgebungsvariablen; es ist **kein** Geheimnis im
Repository. Nur die Variablennamen sind dokumentiert.

| Variable                | Pflicht | Bedeutung                                              | Beispiel                              |
| ----------------------- | ------- | ------------------------------------------------------ | ------------------------------------- |
| `DATABASE_URL`          | ja      | Verbindung zur PostgreSQL-Datenbank                     | `postgresql://app@localhost:5432/app` |
| `SECRET_KEY`            | ja      | Schlüssel zum Signieren der JWT-Access-Tokens           | pro Lauf zufällig erzeugt             |
| `CORS_ORIGINS`          | nein    | Kommaseparierte Origins von Forum und Admin-Panel       | `http://localhost:5173,http://localhost:5174` |
| `RATE_LIMIT_PER_MINUTE` | nein    | Obergrenze für Schreibzugriffe pro Minute (Default 30)  | `30`                                  |

Fehlt ein Pflichtwert, verweigert der Prozess den Start mit einer Meldung, die
die fehlende Variable nennt.

## Starten (Entwicklung)

```bash
export DATABASE_URL="postgresql://app@localhost:5432/app"
export SECRET_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Beim Start validiert die API ihre Konfiguration und bringt das Schema
automatisch per `alembic upgrade head` auf den aktuellen Stand. Danach:

- `GET http://localhost:8000/health` → `{"status": "ok"}`
- `GET http://localhost:8000/docs` → interaktive OpenAPI-Oberfläche
- `GET http://localhost:8000/openapi.json` → das OpenAPI-Dokument

Die Migration lässt sich auch manuell ausführen:

```bash
cd backend && alembic upgrade head
```

## Build für die Produktion

Der API-Dienst hat keinen eigenen Build-Schritt. Für den Produktivbetrieb wird
uvicorn ohne Reloader und mit mehreren Workern gestartet:

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

## Testen

```bash
cd backend
PYTHONPATH=. python -m pytest
```

Die Tests laufen gegen die über `DATABASE_URL` benannte PostgreSQL-Datenbank und
erzeugen ihr Schema über `alembic upgrade head`.

## Verwendung (API)

Basis-Pfad aller Endpunkte ist `/api/v1`; der Health-Endpunkt liegt unter
`/health`.

### Fehlerhülle

Jede Fehlerantwort – 400, 401, 403, 404, 409, 422, 429 – hat dieselbe Form:

```json
{
  "error": {
    "code": "not_found",
    "message": "Not Found",
    "details": null
  }
}
```

Validierungsfehler (422) tragen Feldinformationen in `details`:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Validation failed",
    "details": [{ "field": "password", "message": "Field required" }]
  }
}
```

### Authentifizierung

Geschützte Endpunkte erwarten den Header `Authorization: Bearer <access_token>`.
`POST /api/v1/auth/login` liefert den Access-Token (TTL 900 s) im Body und setzt
den Refresh-Token als HttpOnly-Cookie `refresh_token`
(`SameSite=Lax`, `Path=/api/v1/auth`, 30 Tage).

### Paginierung

Jede Listenantwort hat die Form:

```json
{ "items": [], "page": 1, "per_page": 20, "total": 0, "pages": 0 }
```

`page` ist `>= 1` (Default 1), `per_page` Default 20 und maximal 100. Eine Seite
hinter der letzten liefert `items: []` und keinen Fehler.

### Endpunkte

| Methode | Pfad                                        | Auth        | Beschreibung                              |
| ------- | ------------------------------------------- | ----------- | ----------------------------------------- |
| GET     | `/health`                                   | –           | Liveness-Check                            |
| POST    | `/api/v1/auth/register`                     | –           | Registrierung                             |
| POST    | `/api/v1/auth/login`                        | –           | Anmeldung, Access-Token + Refresh-Cookie  |
| POST    | `/api/v1/auth/refresh`                      | Cookie      | Access-Token erneuern (Cookie rotiert)    |
| POST    | `/api/v1/auth/logout`                       | Cookie      | Abmelden, Cookie löschen                  |
| POST    | `/api/v1/auth/change-password`              | Bearer      | Passwort ändern                           |
| GET     | `/api/v1/users/me`                          | Bearer      | Eigenes Profil                            |
| PATCH   | `/api/v1/users/me`                          | Bearer      | Profil bearbeiten                         |
| GET     | `/api/v1/users/{username}`                  | –           | Öffentliches Profil                       |
| GET     | `/api/v1/users/{username}/threads`          | –           | Threads einer Nutzerin/eines Nutzers      |
| GET     | `/api/v1/users/{username}/comments`         | –           | Kommentare einer Nutzerin/eines Nutzers   |
| GET     | `/api/v1/categories`                        | –           | Kategorienliste                           |
| GET     | `/api/v1/categories/{slug}`                 | –           | Kategorie nach Slug                       |
| POST    | `/api/v1/admin/categories`                  | Admin       | Kategorie anlegen                         |
| PATCH   | `/api/v1/admin/categories/{id}`             | Admin       | Kategorie bearbeiten                      |
| PUT     | `/api/v1/admin/categories/order`            | Admin       | Kategorien neu ordnen                     |
| GET     | `/api/v1/threads`                           | –           | Thread-Feed (`sort=new\|top\|hot`)         |
| GET     | `/api/v1/threads/{id}`                      | –           | Thread-Detail                             |
| POST    | `/api/v1/threads`                           | Bearer      | Thread anlegen                            |
| PATCH   | `/api/v1/threads/{id}`                      | Bearer      | Thread bearbeiten                         |
| DELETE  | `/api/v1/threads/{id}`                      | Bearer      | Thread löschen (Soft-Delete)              |
| POST    | `/api/v1/threads/{id}/vote`                 | Bearer      | Thread bewerten (`value: 1\|-1`)           |
| POST    | `/api/v1/comments/{id}/vote`                | Bearer      | Kommentar bewerten (`value: 1\|-1`)        |
| GET     | `/api/v1/threads/{id}/comments`             | –           | Kommentarbaum                             |
| POST    | `/api/v1/threads/{id}/comments`             | Bearer      | Kommentar anlegen                         |
| PATCH   | `/api/v1/comments/{id}`                     | Bearer      | Kommentar bearbeiten                      |
| DELETE  | `/api/v1/comments/{id}`                     | Bearer      | Kommentar löschen (Soft-Delete)           |
| GET     | `/api/v1/threads/{id}/subscription`         | Bearer      | Abo-Status                                |
| POST    | `/api/v1/threads/{id}/subscription`         | Bearer      | Thread abonnieren                         |
| DELETE  | `/api/v1/threads/{id}/subscription`         | Bearer      | Abo entfernen                             |
| GET     | `/api/v1/search`                            | –           | Volltextsuche                             |
| POST    | `/api/v1/reports`                           | Bearer      | Inhalt melden                             |
| GET     | `/api/v1/notifications`                     | Bearer      | Benachrichtigungen                        |
| GET     | `/api/v1/notifications/unread-count`        | Bearer      | Anzahl ungelesener Benachrichtigungen     |
| POST    | `/api/v1/notifications/{id}/read`           | Bearer      | Eine Benachrichtigung als gelesen markieren |
| POST    | `/api/v1/notifications/read-all`            | Bearer      | Alle als gelesen markieren                |
| POST    | `/api/v1/threads/{id}/moderate`             | Moderator   | Thread moderieren                         |
| GET     | `/api/v1/moderation/reports`                | Moderator   | Moderations-Warteschlange                 |
| POST    | `/api/v1/moderation/reports/{id}/resolve`   | Moderator   | Meldung abarbeiten                        |
| GET     | `/api/v1/admin/stats`                       | Admin       | Dashboard-Statistiken                     |
| GET     | `/api/v1/admin/users`                       | Admin       | Nutzerliste (Suche + Paginierung)         |
| PATCH   | `/api/v1/admin/users/{id}/role`             | Admin       | Rolle ändern                              |
| POST    | `/api/v1/admin/users/{id}/ban`              | Admin       | Nutzer sperren                            |
| DELETE  | `/api/v1/admin/users/{id}/ban`              | Admin       | Sperre aufheben                           |
| GET     | `/api/v1/admin/audit-logs`                  | Admin       | Audit-Log                                |

### Beispiele

Registrierung:

```
POST /api/v1/auth/register
{ "username": "ada", "email": "ada@example.org", "password": "…" }
```

Antwort `201`:

```json
{
  "id": 1,
  "username": "ada",
  "display_name": "ada",
  "avatar_url": null
}
```

Anmeldung:

```
POST /api/v1/auth/login
{ "username_or_email": "ada", "password": "…" }
```

Antwort `200`:

```json
{
  "access_token": "…",
  "token_type": "bearer",
  "expires_in": 900,
  "user": {
    "id": 1,
    "username": "ada",
    "display_name": "ada",
    "avatar_url": null,
    "email": "ada@example.org",
    "role": "user",
    "bio": null,
    "karma": 0,
    "is_banned": false,
    "ban_reason": null,
    "ban_expires_at": null
  }
}
```

## Funktionsumfang

- Vollständige REST-Vertrags-Routen-Tabelle unter `/api/v1` (Skeleton, noch 501)
- Einheitliche Fehlerhülle für jeden Fehlerstatus inklusive Validierungsfehler
- CORS für die Origins von Forum- und Admin-Panel
- Argon2id-Passwort-Hashing, JWT-Access-Tokens, gehashte Refresh-Tokens
- Vollständiges Datenbankschema (Nutzer, Tokens, Kategorien, Threads,
  Kommentare, Votes, Abos, Benachrichtigungen, Meldungen, Audit-Log, Jobs)
- Alembic-Migrationen; Schema entsteht ausschließlich über `alembic upgrade head`
- Serverseitiges Markdown-Rendering mit Sanitizing (nh3)
- Job-Warteschlange als Tabelle in derselben Datenbank
- `GET /health` und OpenAPI-Dokument
