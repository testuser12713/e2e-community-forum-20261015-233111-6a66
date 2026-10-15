import { Placeholder } from "./Placeholder";

export interface SubscribeButtonProps {
  subscribed: boolean;
  onToggle?: () => void;
  disabled?: boolean;
}

/** Thread subscription toggle. Filled by a later ticket. */
export function SubscribeButton(_props: SubscribeButtonProps) {
  return <Placeholder title="Abonnieren" />;
}

export default SubscribeButton;
