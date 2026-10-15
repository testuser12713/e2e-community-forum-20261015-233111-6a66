import { api } from "./client";
import type {
  NotificationOut,
  Page,
  PaginationParams,
  UnreadCount,
} from "./types";

export async function listNotifications(
  params: PaginationParams = {},
): Promise<Page<NotificationOut>> {
  return api.get<Page<NotificationOut>>("/api/v1/notifications", {
    query: { ...params },
  });
}

export async function getUnreadCount(): Promise<UnreadCount> {
  return api.get<UnreadCount>("/api/v1/notifications/unread-count");
}

export async function markRead(id: number): Promise<void> {
  return api.post<void>(`/api/v1/notifications/${id}/read`);
}

export async function markAllRead(): Promise<void> {
  return api.post<void>("/api/v1/notifications/read-all");
}
