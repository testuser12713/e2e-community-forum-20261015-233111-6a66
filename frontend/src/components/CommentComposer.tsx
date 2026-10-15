import { Placeholder } from "./Placeholder";

export interface CommentComposerProps {
  onSubmit?: (body: string) => void;
  disabled?: boolean;
  disabledReason?: string;
  submitting?: boolean;
}

/** Comment input. Filled by a later ticket. */
export function CommentComposer(_props: CommentComposerProps) {
  return <Placeholder title="Kommentar verfassen" />;
}

export default CommentComposer;
