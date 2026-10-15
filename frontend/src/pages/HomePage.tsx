import { ThreadFeed } from "../components/ThreadFeed";

/** The start page: the paginated thread feed across all categories. */
export function HomePage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Startseite</h1>
      <ThreadFeed />
    </div>
  );
}

export default HomePage;
