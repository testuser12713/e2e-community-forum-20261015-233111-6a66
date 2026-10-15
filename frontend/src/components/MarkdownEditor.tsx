import { Placeholder } from "./Placeholder";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  submitting?: boolean;
}

/** Write/preview Markdown editor. Filled by a later ticket. */
export function MarkdownEditor(_props: MarkdownEditorProps) {
  return <Placeholder title="Markdown-Editor" />;
}

export default MarkdownEditor;
