"""Server-side Markdown rendering with sanitising.

Bodies are stored as Markdown source; the returned HTML is escaped and
sanitised so raw HTML, ``<script>`` and ``javascript:`` input reach the browser
as literal text (AC-12).
"""

from __future__ import annotations

from markdown_it import MarkdownIt
from nh3 import clean

_markdown = MarkdownIt("commonmark", {"html": False, "linkify": False, "breaks": False})


def render_markdown(source: str) -> str:
    """Render Markdown ``source`` to sanitised HTML."""
    if not source:
        return ""
    return clean(_markdown.render(source))
