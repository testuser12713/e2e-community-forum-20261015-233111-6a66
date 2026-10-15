import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getCategory } from "../api/categories";
import { ThreadFeed } from "../components/ThreadFeed";

/** One category's paginated thread feed. */
export function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const categoryQuery = useQuery({
    queryKey: ["category", slug],
    queryFn: () => getCategory(slug ?? ""),
    enabled: Boolean(slug),
    retry: false,
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        {categoryQuery.data ? `Kategorie: ${categoryQuery.data.name}` : "Kategorie"}
      </h1>
      <ThreadFeed category={slug} />
    </div>
  );
}

export default CategoryPage;
