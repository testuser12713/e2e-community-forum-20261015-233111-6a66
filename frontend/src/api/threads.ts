import { api } from "./client";
import type {
  CreateThreadInput,
  Page,
  PaginationParams,
  ThreadDetail,
  ThreadSummary,
  UpdateThreadInput,
} from "./types";

export type ThreadSort = "new" | "top" | "hot";

export interface ThreadQuery extends PaginationParams {
  sort?: ThreadSort;
  category?: string;
  tag?: string;
}

export async function listThreads(
  params: ThreadQuery = {},
): Promise<Page<ThreadSummary>> {
  return api.get<Page<ThreadSummary>>("/api/v1/threads", {
    query: { ...params },
  });
}

export async function getThread(id: number): Promise<ThreadDetail> {
  return api.get<ThreadDetail>(`/api/v1/threads/${id}`);
}

export async function createThread(
  input: CreateThreadInput,
): Promise<ThreadDetail> {
  return api.post<ThreadDetail>("/api/v1/threads", input);
}

export async function updateThread(
  id: number,
  input: UpdateThreadInput,
): Promise<ThreadDetail> {
  return api.patch<ThreadDetail>(`/api/v1/threads/${id}`, input);
}

export async function deleteThread(id: number): Promise<void> {
  return api.del<void>(`/api/v1/threads/${id}`);
}
