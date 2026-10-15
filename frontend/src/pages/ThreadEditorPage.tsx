import { useParams } from "react-router-dom";
import { Placeholder } from "../components/Placeholder";

export function ThreadEditorPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Placeholder
      title={id ? "Thread bearbeiten" : "Thread erstellen"}
      hint={id ? `Thread #${id} wird hier bearbeitet.` : "Der Editor für neue Threads."}
    />
  );
}

export default ThreadEditorPage;
