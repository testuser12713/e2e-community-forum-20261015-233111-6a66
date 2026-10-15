import { Placeholder } from "./Placeholder";

export interface MarkdownViewProps {
  markdown: string;
  html: string;
}

/** Renders server-sanitised Markdown HTML. Filled by a later ticket. */
export function MarkdownView(_props: MarkdownViewProps) {
  return <Placeholder title="Markdown-Ansicht" />;
}

export default MarkdownView;
