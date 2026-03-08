"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  FileText,
  Download,
  ExternalLink,
  Loader2,
  AlertCircle,
  Calendar,
  Search,
  FolderOpen,
} from "lucide-react";
import { get } from "@/lib/api-client";
import type { Report, Case } from "@/types";

// ─── Types ────────────────────────────────────────────────────

interface ReportRow {
  report: Report;
  caseTitle: string;
  patientReference: string | null;
  caseStatus: string;
  casePriority: string;
}

// ─── Helpers ─────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const STATUS_COLORS: Record<string, string> = {
  completed: "text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400",
  under_review: "text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400",
  flagged: "text-orange-700 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400",
  processing: "text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400",
  uploaded: "text-gray-600 bg-gray-100 dark:bg-gray-800",
};

// ─── Page ─────────────────────────────────────────────────────

export default function ReportsPage() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch all cases that belong to the current clinic
      const cases = await get<{ cases: Case[] }>("/api/v1/cases?per_page=200");
      const caseList: Case[] = cases.cases ?? [];

      // For each case, try to load its reports
      const allRows: ReportRow[] = [];
      await Promise.all(
        caseList.map(async (c) => {
          try {
            const reports = await get<Report[]>(`/api/v1/reports/${c.id}`);
            for (const report of reports) {
              allRows.push({
                report,
                caseTitle: c.title,
                patientReference: c.patient_reference,
                caseStatus: c.status,
                casePriority: c.priority,
              });
            }
          } catch {
            // Case may have no reports — ignore
          }
        })
      );

      // Sort by generated_at descending
      allRows.sort(
        (a, b) =>
          new Date(b.report.generated_at).getTime() -
          new Date(a.report.generated_at).getTime()
      );
      setRows(allRows);
    } catch {
      setError("Failed to load reports. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleDownload = async (row: ReportRow) => {
    const { report } = row;
    setDownloadingId(report.id);
    try {
      const a = document.createElement("a");
      a.href = `/api/v1/reports/${report.case_id}/download/${report.id}`;
      a.download = `auranode-report-${report.case_id.slice(0, 8)}.pdf`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setDownloadingId(null);
    }
  };

  // ── Filtering ───────────────────────────────────────────────
  const filtered = rows.filter((row) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      row.caseTitle.toLowerCase().includes(q) ||
      (row.patientReference?.toLowerCase().includes(q) ?? false);

    const generatedAt = new Date(row.report.generated_at);
    const matchesFrom = !dateFrom || generatedAt >= new Date(dateFrom);
    const matchesTo =
      !dateTo || generatedAt <= new Date(new Date(dateTo).setHours(23, 59, 59, 999));

    return matchesSearch && matchesFrom && matchesTo;
  });

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          PDF diagnostic reports generated for your cases.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search case or patient…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground whitespace-nowrap">
            From
          </label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground whitespace-nowrap">
            To
          </label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {(search || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setDateFrom("");
              setDateTo("");
            }}
            className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-accent transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Failed to load reports</p>
            <p className="mt-0.5 text-xs">{error}</p>
          </div>
          <button
            type="button"
            onClick={fetchReports}
            className="text-xs underline hover:no-underline ml-2"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-background py-20 text-center">
          <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          {rows.length === 0 ? (
            <>
              <p className="font-medium text-sm">No reports yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Reports are generated once a case is completed and reviewed by a specialist.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium text-sm">No reports match your filters</p>
              <p className="text-xs text-muted-foreground mt-1">
                Try adjusting your search or date range.
              </p>
            </>
          )}
        </div>
      )}

      {/* Table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="rounded-2xl border border-border bg-white dark:bg-gray-900 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    Case Title
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    Patient Ref
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    Generated
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(({ report, caseTitle, patientReference, caseStatus }) => (
                  <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        <Link
                          href={`/dashboard/cases/${report.case_id}`}
                          className="truncate font-medium hover:text-primary hover:underline max-w-[200px]"
                          title={caseTitle}
                        >
                          {caseTitle}
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground">
                        {patientReference ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                          STATUS_COLORS[caseStatus] ?? "text-gray-600 bg-gray-100"
                        }`}
                      >
                        {caseStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                        {formatDate(report.generated_at)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownload({ report, caseTitle, patientReference, caseStatus, casePriority: "" })}
                          disabled={downloadingId === report.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-60 transition-colors"
                          title="Download PDF"
                        >
                          {downloadingId === report.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          Download
                        </button>
                        <a
                          href={report.report_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-primary/10 text-primary px-2.5 py-1 text-xs font-medium hover:bg-primary/20 transition-colors"
                          title="View report"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border">
            {filtered.map(({ report, caseTitle, patientReference, caseStatus }) => (
              <div key={report.id} className="p-4 space-y-3">
                <div className="flex items-start gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/dashboard/cases/${report.case_id}`}
                      className="font-medium text-sm hover:text-primary hover:underline truncate block"
                    >
                      {caseTitle}
                    </Link>
                    {patientReference && (
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        {patientReference}
                      </p>
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize flex-shrink-0 ${
                      STATUS_COLORS[caseStatus] ?? "text-gray-600 bg-gray-100"
                    }`}
                  >
                    {caseStatus.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  {formatDate(report.generated_at)}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownload({ report, caseTitle, patientReference, caseStatus, casePriority: "" })}
                    disabled={downloadingId === report.id}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60 transition-colors"
                  >
                    {downloadingId === report.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Download
                  </button>
                  <a
                    href={report.report_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row count */}
      {!loading && !error && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Showing {filtered.length} of {rows.length} report{rows.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
