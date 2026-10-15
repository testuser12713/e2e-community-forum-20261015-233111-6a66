import { Placeholder } from "./Placeholder";
import type { VoteValue } from "../api/types";

export interface VoteButtonsProps {
  score: number;
  value: VoteValue;
  onVote?: (value: VoteValue) => void;
  disabled?: boolean;
  disabledReason?: string;
}

/** Vertical vote control. Filled by a later ticket. */
export function VoteButtons(_props: VoteButtonsProps) {
  return <Placeholder title="Bewertung" />;
}

export default VoteButtons;
