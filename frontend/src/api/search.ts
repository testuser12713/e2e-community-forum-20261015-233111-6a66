import { api } from "./client";
import type { Page, PaginationParams, ThreadSummary } from "./types";

export interface SearchQuery extends PaginationParams {
  q: string;
  category?: string;
  tag?: string;
}

export async function searchThreads(
  params: SearchQuery,
): Promise<Page<ThreadSummary>> {
  return api.get<Page<ThreadSummary>>("/api/v1/search", {
    query: { ...params },
  });
}
