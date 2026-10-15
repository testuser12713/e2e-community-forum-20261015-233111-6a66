import { Placeholder } from "./Placeholder";
import type { ModerationAction } from "../api/types";

export interface ModerationMenuProps {
  threadId: number;
  isPinned?: boolean;
  isLocked?: boolean;
  onAction?: (action: ModerationAction) => void;
}

/** Moderator action menu. Filled by a later ticket. */
export function ModerationMenu(_props: ModerationMenuProps) {
  return <Placeholder title="Moderationsmenü" />;
}

export default ModerationMenu;
