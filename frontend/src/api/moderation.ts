import { api } from "./client";
import type {
  ModerateThreadInput,
  Page,
  PaginationParams,
  ReportOut,
  ReportStatus,
  ResolveReportInput,
  ThreadDetail,
} from "./types";

export interface ReportQuery extends PaginationParams {
  status?: ReportStatus;
}

export async function moderateThread(
  id: number,
  input: ModerateThreadInput,
): Promise<ThreadDetail> {
  return api.post<ThreadDetail>(`/api/v1/threads/${id}/moderate`, input);
}

export async function listReports(
  params: ReportQuery = {},
): Promise<Page<ReportOut>> {
  return api.get<Page<ReportOut>>("/api/v1/moderation/reports", {
    query: { ...params },
  });
}

export async function resolveReport(
  id: number,
  input: ResolveReportInput,
): Promise<ReportOut> {
  return api.post<ReportOut>(`/api/v1/moderation/reports/${id}/resolve`, input);
}
