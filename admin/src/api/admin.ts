import { apiRequest, buildQuery } from "./client";
import type {
  AdminStats,
  AdminUserOut,
  AuditLogOut,
  AuditTargetType,
  CategoryOut,
  CategoryPatch,
  CategoryWrite,
  Page,
  ReportOut,
  ReportStatus,
  Role,
  ThreadDetail,
} from "./types";

export interface PageParams {
  page?: number;
  per_page?: number;
}

/* ------------------------------------------------------------------ stats */

export async function getAdminStats(): Promise<AdminStats> {
  return apiRequest<AdminStats>("/api/v1/admin/stats");
}

/* ------------------------------------------------------------------ users */

export interface AdminUserQuery extends PageParams {
  q?: string;
}

export async function listAdminUsers(
  query: AdminUserQuery = {},
): Promise<Page<AdminUserOut>> {
  return apiRequest<Page<AdminUserOut>>(
    `/api/v1/admin/users${buildQuery({
      q: query.q,
      page: query.page,
      per_page: query.per_page,
    })}`,
  );
}

export async function setUserRole(
  userId: number,
  role: Role,
): Promise<AdminUserOut> {
  return apiRequest<AdminUserOut>(`/api/v1/admin/users/${userId}/role`, {
    method: "PATCH",
    body: { role },
  });
}

export interface BanPayload {
  reason: string;
  expires_at?: string | null;
}

export async function banUser(
  userId: number,
  payload: BanPayload,
): Promise<AdminUserOut> {
  return apiRequest<AdminUserOut>(`/api/v1/admin/users/${userId}/ban`, {
    method: "POST",
    body: payload,
  });
}

export async function unbanUser(userId: number): Promise<AdminUserOut> {
  return apiRequest<AdminUserOut>(`/api/v1/admin/users/${userId}/ban`, {
    method: "DELETE",
  });
}

/* ------------------------------------------------------------- categories */

export async function listCategories(
  query: PageParams = {},
): Promise<Page<CategoryOut>> {
  return apiRequest<Page<CategoryOut>>(
    `/api/v1/categories${buildQuery({
      page: query.page,
      per_page: query.per_page,
    })}`,
    { auth: false },
  );
}

export async function createCategory(
  payload: CategoryWrite,
): Promise<CategoryOut> {
  return apiRequest<CategoryOut>("/api/v1/admin/categories", {
    method: "POST",
    body: payload,
  });
}

export async function updateCategory(
  categoryId: number,
  patch: CategoryPatch,
): Promise<CategoryOut> {
  return apiRequest<CategoryOut>(
    `/api/v1/admin/categories/${categoryId}`,
    { method: "PATCH", body: patch },
  );
}

export async function reorderCategories(
  ids: number[],
): Promise<Page<CategoryOut>> {
  return apiRequest<Page<CategoryOut>>("/api/v1/admin/categories/order", {
    method: "PUT",
    body: { ids },
  });
}

/* -------------------------------------------------------------- moderation */

export interface ReportQuery extends PageParams {
  status?: ReportStatus;
}

export async function listReports(
  query: ReportQuery = {},
): Promise<Page<ReportOut>> {
  return apiRequest<Page<ReportOut>>(
    `/api/v1/moderation/reports${buildQuery({
      status: query.status,
      page: query.page,
      per_page: query.per_page,
    })}`,
  );
}

export async function resolveReport(
  reportId: number,
  action: "remove_content" | "dismiss",
): Promise<ReportOut> {
  return apiRequest<ReportOut>(
    `/api/v1/moderation/reports/${reportId}/resolve`,
    { method: "POST", body: { action } },
  );
}

export type ModerationAction =
  | "pin"
  | "unpin"
  | "lock"
  | "unlock"
  | "move"
  | "remove";

export interface ModerateThreadPayload {
  action: ModerationAction;
  category_id?: number;
}

export async function moderateThread(
  threadId: number,
  payload: ModerateThreadPayload,
): Promise<ThreadDetail> {
  return apiRequest<ThreadDetail>(`/api/v1/threads/${threadId}/moderate`, {
    method: "POST",
    body: payload,
  });
}

/* -------------------------------------------------------------- audit log */

export interface AuditLogQuery extends PageParams {
  actor_id?: number;
  action?: string;
  target_type?: AuditTargetType;
}

export async function listAuditLogs(
  query: AuditLogQuery = {},
): Promise<Page<AuditLogOut>> {
  return apiRequest<Page<AuditLogOut>>(
    `/api/v1/admin/audit-logs${buildQuery({
      actor_id: query.actor_id,
      action: query.action,
      target_type: query.target_type,
      page: query.page,
      per_page: query.per_page,
    })}`,
  );
}
