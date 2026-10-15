import { api } from "./client";
import type {
  CommentNode,
  CreateCommentInput,
  Page,
  PaginationParams,
} from "./types";

export async function listComments(
  threadId: number,
  params: PaginationParams = {},
): Promise<Page<CommentNode>> {
  return api.get<Page<CommentNode>>(`/api/v1/threads/${threadId}/comments`, {
    query: { ...params },
  });
}

export async function createComment(
  threadId: number,
  input: CreateCommentInput,
): Promise<CommentNode> {
  return api.post<CommentNode>(`/api/v1/threads/${threadId}/comments`, input);
}

export async function updateComment(
  id: number,
  body: string,
): Promise<CommentNode> {
  return api.patch<CommentNode>(`/api/v1/comments/${id}`, { body });
}

export async function deleteComment(id: number): Promise<void> {
  return api.del<void>(`/api/v1/comments/${id}`);
}
