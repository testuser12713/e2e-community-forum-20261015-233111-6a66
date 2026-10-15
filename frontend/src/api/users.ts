import { api } from "./client";
import type {
  CommentSummary,
  Page,
  PaginationParams,
  ThreadSummary,
  UpdateProfileInput,
  UserMe,
  UserProfileOut,
} from "./types";

export async function getMe(): Promise<UserMe> {
  return api.get<UserMe>("/api/v1/users/me");
}

export async function updateMe(input: UpdateProfileInput): Promise<UserMe> {
  return api.patch<UserMe>("/api/v1/users/me", input);
}

export async function getUser(username: string): Promise<UserProfileOut> {
  return api.get<UserProfileOut>(
    `/api/v1/users/${encodeURIComponent(username)}`,
  );
}

export async function getUserThreads(
  username: string,
  params: PaginationParams = {},
): Promise<Page<ThreadSummary>> {
  return api.get<Page<ThreadSummary>>(
    `/api/v1/users/${encodeURIComponent(username)}/threads`,
    { query: { ...params } },
  );
}

export async function getUserComments(
  username: string,
  params: PaginationParams = {},
): Promise<Page<CommentSummary>> {
  return api.get<Page<CommentSummary>>(
    `/api/v1/users/${encodeURIComponent(username)}/comments`,
    { query: { ...params } },
  );
}
