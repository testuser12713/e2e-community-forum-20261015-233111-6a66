import { useParams } from "react-router-dom";
import { Placeholder } from "../components/Placeholder";

export function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <Placeholder
      title="Kategorie"
      hint={slug ? `Threads der Kategorie „${slug}“ erscheinen hier.` : undefined}
    />
  );
}

export default CategoryPage;
