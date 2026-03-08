"use client";

import { Download, FileText, ExternalLink, Calendar, User } from "lucide-react";
import type { Report, CasePriority } from "@/types";

// ─── Risk badge ───────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  high: "text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400",
  moderate: "text-orange-700 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400",
  low: "text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400",
  unknown: "text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-400",
};

function riskLabel(score: number | null | undefined): string {
  if (score == null) return "unknown";
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "moderate";
  return "low";
}

// ─── Props ────────────────────────────────────────────────────

interface ReportCardProps {
  report: Report;
  caseTitle: string;
  patientReference: string | null;
  casePriority?: CasePriority;
  riskScore?: number | null;
  onDownload?: (report: Report) => void;
}

// ─── Component ───────────────────────────────────────────────

export function ReportCard({
  report,
  caseTitle,
  patientReference,
  casePriority,
  riskScore,
  onDownload,
}: ReportCardProps) {
  const risk = riskLabel(riskScore);
  const riskClass = RISK_COLORS[risk];

  const PRIORITY_COLORS: Record<string, string> = {
    low: "text-gray-600 bg-gray-100 dark:bg-gray-800",
    normal: "text-blue-700 bg-blue-100 dark:bg-blue-900/30",
    high: "text-orange-700 bg-orange-100 dark:bg-orange-900/30",
    critical: "text-red-700 bg-red-100 dark:bg-red-900/30",
  };

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-gray-900 p-5 space-y-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 flex-shrink-0 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
          <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate text-sm" title={caseTitle}>
            {caseTitle}
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
            Report ID: {report.id.slice(0, 8)}…
          </p>
        </div>
        {/* Priority badge */}
        {casePriority && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize flex-shrink-0 ${
              PRIORITY_COLORS[casePriority] ?? ""
            }`}
          >
            {casePriority}
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="space-y-1.5 text-xs text-muted-foreground">
        {patientReference && (
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              Patient:{" "}
              <span className="font-mono text-foreground">{patientReference}</span>
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Generated:{" "}
            <span className="text-foreground">
              {new Date(report.generated_at).toLocaleString()}
            </span>
          </span>
        </div>

        {/* Risk badge */}
        <div className="pt-0.5">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${riskClass}`}>
            {risk === "unknown" ? "Risk: N/A" : `${risk} risk`}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {onDownload && (
          <button
            type="button"
            onClick={() => onDownload(report)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </button>
        )}
        <a
          href={report.report_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View Report
        </a>
      </div>
    </div>
  );
}
