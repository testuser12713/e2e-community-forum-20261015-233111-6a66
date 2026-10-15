import { api } from "./client";
import type { VoteOut, VoteValue } from "./types";

export async function voteThread(
  id: number,
  value: VoteValue,
): Promise<VoteOut> {
  return api.post<VoteOut>(`/api/v1/threads/${id}/vote`, { value });
}

export async function voteComment(
  id: number,
  value: VoteValue,
): Promise<VoteOut> {
  return api.post<VoteOut>(`/api/v1/comments/${id}/vote`, { value });
}
