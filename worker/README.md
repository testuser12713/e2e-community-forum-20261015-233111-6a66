# Worker

Eigener Python-Prozess des Community-Forums, der gegen dieselbe PostgreSQL-Datenbank
wie die API läuft. Er beansprucht fällige Zeilen der `job`-Tabelle mit
`SELECT ... FOR UPDATE SKIP LOCKED`, führt den passenden Handler in genau einer
Transaktion aus und schließt den Job ab. Zwei parallel laufende Worker verarbeiten
dadurch nie denselben Job doppelt, und ein `SIGTERM` beendet die Schleife sauber.

## Tech-Stack

- Python 3.12+
- SQLAlchemy 2.0, psycopg 3
- PostgreSQL (eigene Modelle, kein Import aus dem API-Paket)
- pytest

## Installation

```bash
cd worker
pip install -r requirements.txt
```

## Konfiguration

Alle Werte kommen aus der Umgebung, kein Geheimnis liegt im Repository:

| Variable | Bedeutung | Standard |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL-Adresse (aus `RUN.json`, `${service:db.url}`) | — (Pflicht) |
| `WORKER_POLL_INTERVAL` | Sekunden zwischen zwei Durchläufen | `5` |
| `HOT_SCORE_INTERVAL` | Sekunden zwischen `thread.hot_score`-Jobs | `300` |
| `SESSION_CLEANUP_INTERVAL` | Sekunden zwischen `session.cleanup`-Jobs | `3600` |

## Starten

Endlosbetrieb (bis `SIGTERM`/`SIGINT`):

```bash
cd worker
DATABASE_URL="postgresql://..." python main.py
```

Einen einzelnen Durchlauf ausführen und beenden:

```bash
DATABASE_URL="postgresql://..." python main.py --once
```

## Tests

```bash
cd worker
DATABASE_URL="postgresql://..." PYTHONPATH=. python -m pytest
```

Die Tests laufen gegen echtes PostgreSQL; SQLite wird nirgends verwendet.

## Job-Arten

Der Handler-Registry (`handlers/__init__.py`) ordnet jeder Job-Art aus dem
gemeinsamen Vertrag eine Handler-Funktion zu:

- `notification.create` → `handlers.notifications.handle`
- `thread.hot_score` → `handlers.hot_score.handle`
- `session.cleanup` → `handlers.session_cleanup.handle`

Jeder Handler hat die Signatur `handle(db: Session, payload: dict) -> None` und
läuft in einem Savepoint: eine Ausnahme rollt nur die Arbeit dieses Jobs zurück und
löst den Wiederholungs-/Backoff-Pfad aus. Nach `max_attempts` landet der Job mit
`last_error` im Zustand `failed`; alle anderen Jobs laufen weiter.
