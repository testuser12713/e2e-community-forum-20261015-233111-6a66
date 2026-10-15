"""Worker entry point.

Wires configuration, the database session factory, the handler registry, the
scheduler and a SIGTERM/SIGINT handler that stops the loop and exits cleanly.
``--once`` processes the currently due jobs and exits.
"""

from __future__ import annotations

import argparse
import logging
import signal
import threading
from collections.abc import Sequence

from config import get_settings
from db import get_session_factory
from engine import Handler, build_worker_id, process_due
from scheduler import Scheduler
from sqlalchemy.orm import Session, sessionmaker

logger = logging.getLogger("worker")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Parse the worker's command-line arguments."""
    parser = argparse.ArgumentParser(prog="worker", description="Forum job worker")
    parser.add_argument(
        "--once",
        action="store_true",
        help="process the currently due jobs and exit",
    )
    return parser.parse_args(argv)


def install_signal_handlers(stop_event: threading.Event) -> dict[int, object]:
    """Install SIGTERM/SIGINT handlers that set ``stop_event``; return the previous ones."""

    def _handler(signum: int, _frame: object) -> None:
        logger.info("received signal %s — stopping", signum)
        stop_event.set()

    previous: dict[int, object] = {}
    for sig in (signal.SIGTERM, signal.SIGINT):
        previous[sig] = signal.signal(sig, _handler)
    return previous


def restore_signal_handlers(previous: dict[int, object] | None) -> None:
    """Restore the signal handlers captured by :func:`install_signal_handlers`."""
    for sig, handler in (previous or {}).items():
        signal.signal(sig, handler)


def tick(
    session_factory: sessionmaker[Session],
    worker_id: str,
    scheduler: Scheduler,
    *,
    handlers: dict[str, Handler] | None = None,
) -> int:
    """Enqueue the due periodic jobs and process the due queue once."""
    session = session_factory()
    try:
        scheduler.enqueue_due(session)
        return process_due(session, worker_id, handlers=handlers)
    finally:
        session.close()


def run_once(
    session_factory: sessionmaker[Session],
    worker_id: str,
    scheduler: Scheduler,
    *,
    handlers: dict[str, Handler] | None = None,
) -> int:
    """Process the currently due jobs and return how many were claimed."""
    return tick(session_factory, worker_id, scheduler, handlers=handlers)


def run_loop(
    session_factory: sessionmaker[Session],
    worker_id: str,
    scheduler: Scheduler,
    *,
    poll_interval: float,
    stop_event: threading.Event,
    handlers: dict[str, Handler] | None = None,
) -> None:
    """Poll until ``stop_event`` is set."""
    while not stop_event.is_set():
        tick(session_factory, worker_id, scheduler, handlers=handlers)
        stop_event.wait(poll_interval)


def main(argv: Sequence[str] | None = None) -> int:
    """Run the worker: once or until a termination signal arrives."""
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    settings = get_settings()
    session_factory = get_session_factory()
    worker_id = build_worker_id()
    scheduler = Scheduler.from_env()
    logger.info(
        "worker %s starting (once=%s, poll=%ss)",
        worker_id,
        args.once,
        settings.poll_interval,
    )

    if args.once:
        run_once(session_factory, worker_id, scheduler)
        return 0

    stop_event = threading.Event()
    previous = install_signal_handlers(stop_event)
    try:
        run_loop(
            session_factory,
            worker_id,
            scheduler,
            poll_interval=settings.poll_interval,
            stop_event=stop_event,
        )
    finally:
        restore_signal_handlers(previous)
    logger.info("worker %s stopped cleanly", worker_id)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
