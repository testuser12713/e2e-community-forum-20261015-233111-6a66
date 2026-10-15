import { api } from "./client";
import type { CreateReportInput, ReportOut } from "./types";

export async function createReport(
  input: CreateReportInput,
): Promise<ReportOut> {
  return api.post<ReportOut>("/api/v1/reports", input);
}
