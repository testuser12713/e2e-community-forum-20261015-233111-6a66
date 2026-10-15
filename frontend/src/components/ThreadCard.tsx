import { Placeholder } from "./Placeholder";
import type { ThreadSummary } from "../api/types";

export interface ThreadCardProps {
  thread: ThreadSummary;
  onVote?: (value: 1 | -1 | 0) => void;
}

/** A single row in a thread list. Filled by a later ticket. */
export function ThreadCard(_props: ThreadCardProps) {
  return <Placeholder title="Thread-Eintrag" />;
}

export default ThreadCard;
