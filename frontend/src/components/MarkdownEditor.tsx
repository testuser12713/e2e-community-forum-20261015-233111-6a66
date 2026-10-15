import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from "react";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  submitting?: boolean;
  /** Accessible label for the textarea. */
  label?: string;
}

/**
 * Client-side Markdown preview renderer.
 *
 * This is DISPLAY ONLY: the stored body is rendered and sanitised by the server
 * (markdown-it-py + nh3). To keep the live preview safe, all raw HTML in the
 * source is escaped first, then a small, well-understood subset of Markdown is
 * turned into elements we control. Raw HTML, `<script>`, `onerror` and
 * `javascript:` URLs therefore appear as literal text and never execute.
 */
function escapeHtml(source: string): string {
  return source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:|\/|#)/i.test(url.trim());
}

function renderInline(text: string): string {
  let out = text;
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, url: string) =>
    isSafeUrl(url)
      ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : label,
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");
  return out;
}

function isBlockStart(line: string): boolean {
  return (
    /^```/.test(line) ||
    /^#{1,6}\s+/.test(line) ||
    /^\s*(?:---|\*\*\*|___)\s*$/.test(line) ||
    /^&gt;\s?/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line)
  );
}

/** Convert escaped Markdown source into safe preview HTML. */
export function renderMarkdownToHtml(source: string): string {
  const escaped = escapeHtml(source);
  const lines = escaped.split(/\r?\n/);
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^```(.*)$/);
    if (fence) {
      const language = fence[1].trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      const cls = language ? ` class="language-${language}"` : "";
      blocks.push(`<pre><code${cls}>${code.join("\n")}</code></pre>`);
      continue;
    }

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push("<hr />");
      i += 1;
      continue;
    }

    if (/^&gt;\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^&gt;\s?/, ""));
        i += 1;
      }
      blocks.push(`<blockquote>${renderInline(quote.join(" "))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(
          `<li>${renderInline(lines[i].replace(/^\s*[-*+]\s+/, ""))}</li>`,
        );
        i += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(
          `<li>${renderInline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`,
        );
        i += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraph: string[] = [line];
    i += 1;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }

  return blocks.join("\n");
}

type EditorTab = "write" | "preview";

interface ToolbarAction {
  key: string;
  label: string;
  before: string;
  after: string;
  placeholder: string;
  icon: ReactElement;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  {
    key: "bold",
    label: "Fett",
    before: "**",
    after: "**",
    placeholder: "Fetter Text",
    icon: <strong aria-hidden="true">B</strong>,
  },
  {
    key: "italic",
    label: "Kursiv",
    before: "*",
    after: "*",
    placeholder: "Kursiver Text",
    icon: <em aria-hidden="true">I</em>,
  },
  {
    key: "link",
    label: "Link",
    before: "[",
    after: "](https://)",
    placeholder: "Linktext",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    key: "code",
    label: "Code",
    before: "`",
    after: "`",
    placeholder: "Code",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    key: "list",
    label: "Liste",
    before: "- ",
    after: "",
    placeholder: "Listenpunkt",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
];

/**
 * Write/preview Markdown editor (DESIGN.md §MarkdownEditor).
 *
 * The tab bar switches between a monospace textarea and a live preview built
 * from the sanitising renderer above. The toolbar inserts Markdown around the
 * current selection; every toolbar control really works (AC-43).
 */
export function MarkdownEditor({
  value,
  onChange,
  onSubmit,
  disabled = false,
  submitting = false,
  label = "Markdown-Text",
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<EditorTab>("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewHtml = useMemo(() => renderMarkdownToHtml(value), [value]);

  function applyAction(action: ToolbarAction): void {
    const el = textareaRef.current;
    const current = value;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const selected = current.slice(start, end) || action.placeholder;
    const next = `${current.slice(0, start)}${action.before}${selected}${action.after}${current.slice(end)}`;
    onChange(next);
    const caret = start + action.before.length + selected.length;
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(caret, caret);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && onSubmit) {
      event.preventDefault();
      onSubmit();
    }
  }

  const tabStyle = (active: boolean): CSSProperties => ({
    height: 44,
    padding: "0 16px",
    border: "none",
    borderRadius: "var(--radius-md)",
    fontSize: 14,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    background: active ? "var(--color-accent-soft)" : "transparent",
    color: active ? "var(--color-accent)" : "var(--color-fg-muted)",
  });

  return (
    <div className="markdown-editor">
      <style>{`
        .markdown-editor__track { display:flex; gap:4px; padding:4px; background:var(--color-bg-subtle); border:1px solid var(--color-border); border-radius:var(--radius-md); width:max-content; margin-bottom:var(--space-2); }
        .markdown-editor__toolbar { display:flex; flex-wrap:wrap; gap:4px; margin-bottom:var(--space-1); }
        .markdown-editor__textarea { width:100%; min-height:200px; resize:vertical; padding:12px; border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-surface); color:var(--color-fg); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:14px; line-height:1.6; }
        .markdown-editor__textarea:focus { outline:none; border-color:var(--color-accent); box-shadow:0 0 0 2px rgba(79,70,229,0.28); }
        .markdown-editor__preview { min-height:200px; padding:12px; border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-surface); font-size:16px; line-height:26px; color:var(--color-fg); }
        .markdown-editor__preview p { margin:0 0 12px; }
        .markdown-editor__preview h1,.markdown-editor__preview h2,.markdown-editor__preview h3,.markdown-editor__preview h4,.markdown-editor__preview h5,.markdown-editor__preview h6 { font-size:20px; font-weight:600; line-height:1.3; margin:16px 0 8px; }
        .markdown-editor__preview code { background:var(--color-bg-subtle); font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:0.9em; padding:2px 4px; border-radius:4px; }
        .markdown-editor__preview pre { background:var(--color-bg-subtle); padding:12px; border-radius:var(--radius-md); overflow-x:auto; }
        .markdown-editor__preview pre code { background:transparent; padding:0; }
        .markdown-editor__preview blockquote { border-left:3px solid var(--color-accent-soft); margin:0 0 12px; padding-left:12px; color:var(--color-fg-muted); }
        .markdown-editor__preview a { color:var(--color-accent); text-decoration:underline; }
        .markdown-editor__preview ul,.markdown-editor__preview ol { margin:0 0 12px; padding-left:24px; }
        .markdown-editor__preview hr { border:none; border-top:1px solid var(--color-border); margin:16px 0; }
      `}</style>

      <div
        className="markdown-editor__track"
        role="tablist"
        aria-label="Editor-Ansicht"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "write"}
          style={tabStyle(tab === "write")}
          onClick={() => setTab("write")}
        >
          Schreiben
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "preview"}
          style={tabStyle(tab === "preview")}
          onClick={() => setTab("preview")}
        >
          Vorschau
        </button>
      </div>

      {tab === "write" ? (
        <>
          <div className="markdown-editor__toolbar" role="toolbar" aria-label="Formatierung">
            {TOOLBAR_ACTIONS.map((action) => (
              <button
                key={action.key}
                type="button"
                className="icon-btn"
                aria-label={action.label}
                title={action.label}
                disabled={disabled || submitting}
                onClick={() => applyAction(action)}
                style={{ width: 36, height: 36 }}
              >
                {action.icon}
              </button>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            className="markdown-editor__textarea"
            aria-label={label}
            value={value}
            disabled={disabled || submitting}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </>
      ) : (
        <div
          className="markdown-editor__preview"
          aria-label="Vorschau"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      )}

      <div style={{ fontSize: 13, color: "var(--color-fg-muted)", marginTop: 4 }}>
        Markdown wird unterstützt. Die Vorschau ist nur zur Anzeige – gespeichert
        wird der Quelltext.
      </div>
    </div>
  );
}

export default MarkdownEditor;
