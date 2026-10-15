import { api } from "./client";
import type { SubscriptionState } from "./types";

export async function getSubscription(
  threadId: number,
): Promise<SubscriptionState> {
  return api.get<SubscriptionState>(
    `/api/v1/threads/${threadId}/subscription`,
  );
}

export async function subscribe(threadId: number): Promise<void> {
  return api.post<void>(`/api/v1/threads/${threadId}/subscription`);
}

export async function unsubscribe(threadId: number): Promise<void> {
  return api.del<void>(`/api/v1/threads/${threadId}/subscription`);
}
