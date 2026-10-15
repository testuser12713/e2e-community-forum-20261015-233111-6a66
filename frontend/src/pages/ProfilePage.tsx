import { useParams } from "react-router-dom";
import { Placeholder } from "../components/Placeholder";

export function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  return (
    <Placeholder
      title="Profil"
      hint={username ? `Das Profil von @${username} erscheint hier.` : undefined}
    />
  );
}

export default ProfilePage;
