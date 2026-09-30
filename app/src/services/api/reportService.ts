import type { ReportFilterValues, ReportResultColumn, ReportResultRow } from "@/components/Admin/ReportsPage/reportResultTypes";
import { squareApi } from "@/services/api/squareApi";

type ReportResult = { columns: ReportResultColumn[]; rows: ReportResultRow[] };
export const reportService = {
  generate(reportId: string, filters: ReportFilterValues) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== "" && value != null) query.set(key, String(value));
    return squareApi<ReportResult>(`/reports/${encodeURIComponent(reportId)}?${query}`);
  },
};
