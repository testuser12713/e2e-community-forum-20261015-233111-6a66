import type { CSSProperties } from "react";

export interface MarkdownViewProps {
  /** The Markdown source as stored by the API — display only, never rendered raw. */
  markdown: string;
  /** The server-rendered, sanitised HTML for the same source. */
  html: string;
}

const bodyStyle: CSSProperties = {
  fontSize: 16,
  lineHeight: "26px",
  color: "var(--color-fg)",
  maxWidth: "68ch",
  overflowWrap: "anywhere",
};

/**
 * Renders the server-rendered, sanitised thread/comment HTML.
 *
 * The body is stored as Markdown source; the API renders it and sanitises the
 * result (markdown-it-py + nh3), so `html` is the only safe representation to
 * show. The raw `markdown` is intentionally never rendered (AC-12) — this
 * component only ever displays the sanitised `html`.
 */
export function MarkdownView(props: MarkdownViewProps) {
  const html = props.html ?? "";

  return (
    <div className="markdown-body" style={bodyStyle}>
      <style>{`
        .markdown-body p { margin: 0 0 12px; }
        .markdown-body p:last-child { margin-bottom: 0; }
        .markdown-body h1, .markdown-body h2, .markdown-body h3,
        .markdown-body h4, .markdown-body h5, .markdown-body h6 {
          font-size: 20px; font-weight: 600; line-height: 1.3; margin: 20px 0 8px;
        }
        .markdown-body a { color: var(--color-accent); text-decoration: underline; }
        .markdown-body code {
          background: var(--color-bg-subtle);
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.9em; padding: 2px 4px; border-radius: 4px;
        }
        .markdown-body pre {
          background: var(--color-bg-subtle);
          padding: 12px; border-radius: var(--radius-md); overflow-x: auto;
        }
        .markdown-body pre code { background: transparent; padding: 0; }
        .markdown-body blockquote {
          border-left: 3px solid var(--color-accent-soft);
          margin: 0 0 12px; padding-left: 12px; color: var(--color-fg-muted);
        }
        .markdown-body ul, .markdown-body ol { margin: 0 0 12px; padding-left: 24px; }
        .markdown-body hr {
          border: none; border-top: 1px solid var(--color-border); margin: 16px 0;
        }
        .markdown-body img { max-width: 100%; height: auto; }
      `}</style>
      <div
        role="document"
        aria-label="Beitragstext"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

export default MarkdownView;
