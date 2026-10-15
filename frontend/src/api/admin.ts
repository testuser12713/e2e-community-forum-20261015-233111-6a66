import { api } from "./client";
import type {
  AdminStats,
  AdminUserOut,
  AuditLogOut,
  BanUserInput,
  Page,
  PaginationParams,
  Role,
} from "./types";

export async function getStats(): Promise<AdminStats> {
  return api.get<AdminStats>("/api/v1/admin/stats");
}

export interface AdminUserQuery extends PaginationParams {
  q?: string;
}

export async function listUsers(
  params: AdminUserQuery = {},
): Promise<Page<AdminUserOut>> {
  return api.get<Page<AdminUserOut>>("/api/v1/admin/users", {
    query: { ...params },
  });
}

export async function setUserRole(
  id: number,
  role: Role,
): Promise<AdminUserOut> {
  return api.patch<AdminUserOut>(`/api/v1/admin/users/${id}/role`, { role });
}

export async function banUser(
  id: number,
  input: BanUserInput,
): Promise<AdminUserOut> {
  return api.post<AdminUserOut>(`/api/v1/admin/users/${id}/ban`, input);
}

export async function unbanUser(id: number): Promise<AdminUserOut> {
  return api.del<AdminUserOut>(`/api/v1/admin/users/${id}/ban`);
}

export interface AuditLogQuery extends PaginationParams {
  actor_id?: number;
  action?: string;
  target_type?: string;
}

export async function listAuditLogs(
  params: AuditLogQuery = {},
): Promise<Page<AuditLogOut>> {
  return api.get<Page<AuditLogOut>>("/api/v1/admin/audit-logs", {
    query: { ...params },
  });
}
