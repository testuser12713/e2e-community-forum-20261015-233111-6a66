import { Placeholder } from "./Placeholder";
import type { CommentNode } from "../api/types";

export interface CommentTreeProps {
  comments: CommentNode[];
}

/** Nested comment tree. Filled by a later ticket. */
export function CommentTree(_props: CommentTreeProps) {
  return <Placeholder title="Kommentare" />;
}

export default CommentTree;
