import { useParams } from "react-router-dom";
import { Placeholder } from "../components/Placeholder";

export function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Placeholder
      title="Thread"
      hint={id ? `Der Thread #${id} wird hier angezeigt.` : undefined}
    />
  );
}

export default ThreadPage;
