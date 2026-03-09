"use client";

import { use, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  AlertCircle,
  Calendar,
  User,
  RefreshCw,
  ChevronDown,
  ExternalLink,
  FilePlus,
} from "lucide-react";
import { StatusBadge } from "@/components/cases/StatusBadge";
import { OCRStatus } from "@/components/analysis/OCRStatus";
import { ExtractedTextViewer } from "@/components/analysis/ExtractedTextViewer";
import { AIFindingsPanel } from "@/components/analysis/AIFindingsPanel";
import { AnalysisSkeleton } from "@/components/analysis/AnalysisSkeleton";
import { CaseTimeline } from "@/components/cases/CaseTimeline";
import { useCase } from "@/hooks/useCases";
import { useAuth } from "@/hooks/useAuth";
import { get, post, put } from "@/lib/api-client";
import type { AnalysisResult, CaseStatus, Report, TimelineEvent } from "@/types";

// ─── Types ──────────────────────────────────────────────────

type Tab = "files" | "analysis" | "review" | "timeline" | "report";

const TABS: { id: Tab; label: string }[] = [
  { id: "files", label: "Files" },
  { id: "analysis", label: "Analysis" },
  { id: "review", label: "Review" },
  { id: "timeline", label: "Timeline" },
  { id: "report", label: "Report" },
];

// ─── Status Timeline ─────────────────────────────────────────

const TIMELINE_STEPS: { status: CaseStatus; label: string }[] = [
  { status: "uploaded", label: "Uploaded" },
  { status: "processing", label: "Processing" },
  { status: "flagged", label: "Flagged" },
  { status: "under_review", label: "Under Review" },
  { status: "completed", label: "Completed" },
];

const STATUS_ORDER: Record<string, number> = {
  uploaded: 0,
  processing: 1,
  processing_failed: 1,
  flagged: 2,
  under_review: 3,
  completed: 4,
  deleted: -1,
};

// Valid next transitions per status
const NEXT_STATUSES: Record<string, string[]> = {
  uploaded:     ["processing"],
  processing:   ["flagged", "completed"],
  flagged:      ["under_review"],
  under_review: ["completed", "flagged"],
};

const PRIORITY_BADGE: Record<string, string> = {
  low: "text-gray-600 bg-gray-100 dark:bg-gray-800",
  normal: "text-blue-600 bg-blue-100 dark:bg-blue-900/30",
  high: "text-orange-600 bg-orange-100 dark:bg-orange-900/30",
  critical: "text-red-600 bg-red-100 dark:bg-red-900/30",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusTimeline({ currentStatus }: { currentStatus: string }) {
  const currentOrder = STATUS_ORDER[currentStatus] ?? 0;

  return (
    <div className="flex items-center gap-0 overflow-x-auto py-2">
      {TIMELINE_STEPS.map((step, i) => {
        const stepOrder = STATUS_ORDER[step.status];
        const isDone = stepOrder < currentOrder;
        const isActive = step.status === currentStatus;
        const isFuture = stepOrder > currentOrder;

        return (
          <div key={step.status} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`
                  h-3 w-3 rounded-full border-2 transition-colors
                  ${isDone ? "bg-primary border-primary" : ""}
                  ${isActive ? "bg-primary border-primary ring-2 ring-primary/30" : ""}
                  ${isFuture ? "bg-background border-border" : ""}
                `}
              />
              <span
                className={`text-xs whitespace-nowrap ${
                  isActive ? "font-semibold text-primary" : isFuture ? "text-muted-foreground" : "text-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < TIMELINE_STEPS.length - 1 && (
              <div
                className={`h-0.5 w-10 sm:w-16 mx-1 mt-[-20px] ${
                  isDone ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Analysis tab content ─────────────────────────────────────

function AnalysisTab({ caseId, caseStatus }: { caseId: string; caseStatus: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);

  const fetchAnalysis = useCallback(async () => {
    setLoadingAnalysis(true);
    setAnalysisError(null);
    try {
      const results = await get<AnalysisResult[]>(`/api/v1/analysis/case/${caseId}`);
      if (results.length > 0) {
        setAnalysis(results[0]);
      } else {
        setAnalysis(null);
      }
    } catch {
      setAnalysisError("Failed to load analysis results.");
    } finally {
      setLoadingAnalysis(false);
    }
  }, [caseId]);

  // Fetch analysis results immediately on mount so existing completed cases
  // render without waiting for OCRStatus to trigger onComplete
  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  const handleReprocess = async () => {
    setReprocessing(true);
    setAnalysisError(null);
    try {
      await post(`/api/v1/analysis/case/${caseId}/reprocess`);
      setAnalysis(null);
    } catch {
      setAnalysisError("Reprocess request failed. Please try again.");
    } finally {
      setReprocessing(false);
    }
  };

  const isProcessing = caseStatus === "processing" || caseStatus === "uploaded";
  const ocrComplete = !!(analysis?.extracted_text);
  const aiComplete =
    analysis != null &&
    (analysis.ai_findings != null || analysis.risk_score != null);
  const aiRunning = ocrComplete && !aiComplete && !loadingAnalysis;

  return (
    <div className="space-y-5">
      {(isProcessing || (!ocrComplete && !loadingAnalysis && !analysisError)) && (
        <OCRStatus caseId={caseId} onComplete={fetchAnalysis} />
      )}

      {analysisError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">Analysis failed</p>
            <p className="mt-0.5 text-xs">{analysisError}</p>
          </div>
          <button
            type="button"
            onClick={fetchAnalysis}
            className="ml-auto inline-flex items-center gap-1 text-xs underline hover:no-underline"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {!isProcessing && !ocrComplete && !loadingAnalysis && !analysisError && (
        <div className="py-10 text-center text-muted-foreground">
          <p className="font-medium">Analysis not yet started</p>
          <p className="mt-1 text-sm">Upload a file and start processing to begin analysis.</p>
        </div>
      )}

      {ocrComplete && analysis && (
        <ExtractedTextViewer
          text={analysis.extracted_text!}
          confidence={analysis.confidence_score ?? 0}
        />
      )}

      {aiRunning && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            AI analysis in progress…
          </p>
          <AnalysisSkeleton />
        </div>
      )}

      {loadingAnalysis && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading analysis…
          </p>
          <AnalysisSkeleton />
        </div>
      )}

      {(aiComplete || caseStatus === "completed" || caseStatus === "flagged") && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            AI Findings
          </p>
          <AIFindingsPanel caseId={caseId} />
        </div>
      )}

      {isAdmin && (
        <button
          type="button"
          onClick={handleReprocess}
          disabled={reprocessing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60 transition-colors"
        >
          {reprocessing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Re-process
        </button>
      )}
    </div>
  );
}

// ─── Status action header ─────────────────────────────────────

interface StatusActionsProps {
  caseId: string;
  currentStatus: string;
  assignedSpecialistId: string | null;
  onUpdated: () => void;
}

function StatusActions({
  caseId,
  currentStatus,
  assignedSpecialistId,
  onUpdated,
}: StatusActionsProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isSpecialist = user?.role === "specialist";

  const [updating, setUpdating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [specialists, setSpecialists] = useState<{ id: string; name: string }[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedSpecialist, setSelectedSpecialist] = useState("");

  const nextStatuses = NEXT_STATUSES[currentStatus] ?? [];

  useEffect(() => {
    if (!isAdmin || assignedSpecialistId) return;
    get<{ users?: Array<{ id: string; full_name?: string; email: string }> }>("/api/v1/auth/users?role=specialist")
      .then((res) => {
        const list = res.users ?? [];
        setSpecialists(list.map((u) => ({ id: u.id, name: u.full_name ?? u.email })));
      })
      .catch(() => {});
  }, [isAdmin, assignedSpecialistId]);

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true);
    setError(null);
    try {
      await put(`/api/v1/cases/${caseId}/status`, { status: newStatus });
      onUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedSpecialist) return;
    setAssigning(true);
    setError(null);
    try {
      await put(`/api/v1/cases/${caseId}/assign`, { specialist_id: selectedSpecialist });
      setAssignOpen(false);
      onUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to assign specialist");
    } finally {
      setAssigning(false);
    }
  };

  if (!isAdmin && !isSpecialist) return null;
  if (nextStatuses.length === 0 && (assignedSpecialistId || !isAdmin)) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {/* Update status dropdown (admin + specialist) */}
      {nextStatuses.length > 0 && (
        <div className="relative">
          {nextStatuses.map((ns) => (
            <button
              key={ns}
              type="button"
              onClick={() => handleStatusChange(ns)}
              disabled={updating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60 transition-colors mr-1.5"
            >
              {updating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Move to: <span className="capitalize">{ns.replaceAll("_", " ")}</span>
            </button>
          ))}
        </div>
      )}

      {/* Assign specialist (admin, only when unassigned) */}
      {isAdmin && !assignedSpecialistId && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setAssignOpen((v) => !v)}
            disabled={assigning}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {assigning ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Assign Specialist
            <ChevronDown className="h-3 w-3" />
          </button>

          {assignOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAssignOpen(false)} aria-hidden="true" />
              <div className="absolute left-0 top-full mt-1 z-20 w-56 rounded-lg border border-border bg-white dark:bg-gray-900 shadow-lg p-3 space-y-2">
                {specialists.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No specialists found.</p>
                ) : (
                  <>
                    <select
                      value={selectedSpecialist}
                      onChange={(e) => setSelectedSpecialist(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      aria-label="Select specialist"
                    >
                      <option value="">Choose specialist…</option>
                      {specialists.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedSpecialist}
                      onClick={handleAssign}
                      className="w-full rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      Assign
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Report tab content ───────────────────────────────────────

function ReportTab({ caseId, caseStatus }: { caseId: string; caseStatus: string }) {
  const { user } = useAuth();
  const canGenerate = user?.role === "admin" || user?.role === "specialist";

  const [report, setReport] = useState<Report | null>(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoadingReport(true);
    setError(null);
    try {
      const reports = await get<Report[]>(`/api/v1/reports/${caseId}`);
      setReport(reports.length > 0 ? reports[0] : null);
    } catch {
      setReport(null);
    } finally {
      setLoadingReport(false);
    }
  }, [caseId]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const newReport = await post<Report>(`/api/v1/reports/${caseId}`);
      setReport(newReport);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate report.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!report) return;
    try {
      const a = document.createElement("a");
      a.href = `/api/v1/reports/${caseId}/download/${report.id}`;
      a.download = `auranode-report-${caseId}.pdf`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      setError("Download failed. Please try again.");
    }
  };

  if (loadingReport) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // Report exists — show it
  if (report) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-border bg-white dark:bg-gray-900 p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 flex-shrink-0 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Diagnostic Analysis Report</p>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                ID: {report.id.slice(0, 8)}…
              </p>
            </div>
          </div>

          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Generated:{" "}
                <span className="text-foreground font-medium">
                  {new Date(report.generated_at).toLocaleString()}
                </span>
              </span>
            </div>
            {report.generated_by && (
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  By:{" "}
                  <span className="text-foreground font-mono">
                    {report.generated_by.slice(0, 8)}…
                  </span>
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </button>
            <a
              href={report.report_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              View Report
            </a>
            {canGenerate && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60 transition-colors"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Regenerate
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}
      </div>
    );
  }

  // No report yet
  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      <div className="py-16 text-center">
        <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
        {canGenerate ? (
          <div className="space-y-3">
            <p className="font-medium text-sm">No report generated yet</p>
            <p className="text-xs text-muted-foreground">
              {caseStatus !== "completed"
                ? "Reports can only be generated for completed cases."
                : "Generate a PDF report with all analysis findings and specialist reviews."}
            </p>
            {caseStatus === "completed" && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FilePlus className="h-4 w-4" />
                )}
                {generating ? "Generating…" : "Generate Report"}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <p className="font-medium text-sm">Report not yet available</p>
            <p className="text-xs text-muted-foreground">
              A report will appear here once a specialist has completed their review.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Timeline tab content ─────────────────────────────────────

function TimelineTab({ caseId }: { caseId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<TimelineEvent[]>(`/api/v1/cases/${caseId}/timeline`);
      setEvents(data);
    } catch {
      setError("Failed to load timeline.");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-400">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium">Failed to load timeline</p>
          <p className="mt-0.5 text-xs">{error}</p>
        </div>
        <button type="button" onClick={fetchTimeline} className="text-xs underline hover:no-underline">
          Retry
        </button>
      </div>
    );
  }

  return <CaseTimeline events={events} loading={loading} />;
}

// ─── Page ───────────────────────────────────────────────────

export default function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { case: caseData, loading, error, refetch } = useCase(id);
  const [activeTab, setActiveTab] = useState<Tab>(
    (searchParams.get("tab") as Tab) ?? "files"
  );
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    router.replace(`?tab=${tab}`, { scroll: false });
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    setDownloadingFileId(fileId);
    try {
      const result = await get<{ signed_url: string }>(`/api/v1/cases/${id}/files/${fileId}/download`);
      const a = document.createElement("a");
      a.href = result.signed_url;
      a.download = fileName;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloadingFileId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="max-w-2xl mx-auto py-16">
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-5 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Failed to load case</p>
            <p className="text-sm mt-0.5">{error ?? "Case not found."}</p>
          </div>
        </div>
        <Link
          href="/dashboard/cases"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Cases
        </Link>
      </div>
    );
  }

  const files = caseData.files ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back */}
      <Link
        href="/dashboard/cases"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Cases
      </Link>

      {/* Case header */}
      <div className="rounded-2xl border border-border bg-white dark:bg-gray-900 p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h1 className="text-xl font-bold truncate">{caseData.title}</h1>
            <p className="font-mono text-xs text-muted-foreground">{caseData.id}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={caseData.status} />
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                PRIORITY_BADGE[caseData.priority] ?? ""
              }`}
            >
              {caseData.priority}
            </span>
          </div>
        </div>

        {caseData.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{caseData.description}</p>
        )}

        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {caseData.patient_reference && (
            <div className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              <span>Patient Ref: <span className="font-mono">{caseData.patient_reference}</span></span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>Created: {new Date(caseData.created_at).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>Updated: {new Date(caseData.updated_at).toLocaleString()}</span>
          </div>
        </div>

        {/* Status transition actions */}
        <StatusActions
          caseId={caseData.id}
          currentStatus={caseData.status}
          assignedSpecialistId={caseData.assigned_specialist_id}
          onUpdated={refetch}
        />

        {/* Status timeline */}
        {caseData.status !== "deleted" && (
          <div className="pt-2">
            <StatusTimeline currentStatus={caseData.status} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div>
        <nav className="flex border-b border-border gap-0" aria-label="Case sections">
          {TABS.map(({ id: tabId, label }) => (
            <button
              key={tabId}
              type="button"
              onClick={() => handleTabChange(tabId)}
              className={`
                px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
                ${activeTab === tabId
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"}
              `}
              aria-current={activeTab === tabId ? "page" : undefined}
            >
              {label}
              {tabId === "files" && files.length > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-xs text-primary">
                  {files.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-5">
          {/* Files tab */}
          {activeTab === "files" && (
            <>
              {files.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No files attached</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex flex-col rounded-xl border border-border bg-white dark:bg-gray-900 p-4 gap-3"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-12 w-12 flex-shrink-0 rounded-lg border border-border bg-muted flex items-center justify-center">
                          {file.file_type.startsWith("image/") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={file.file_url}
                              alt={file.file_name}
                              className="h-full w-full rounded-lg object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <FileText className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium" title={file.file_name}>
                            {file.file_name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatBytes(file.file_size)} · {file.file_type.split("/")[1]?.toUpperCase()}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDownload(file.id, file.file_name)}
                        disabled={downloadingFileId === file.id}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-60 transition-colors"
                      >
                        {downloadingFileId === file.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Analysis tab */}
          {activeTab === "analysis" && (
            <AnalysisTab caseId={id} caseStatus={caseData.status} />
          )}

          {/* Review tab */}
          {activeTab === "review" && (
            <div className="py-16 text-center text-muted-foreground">
              <p className="font-medium">Specialist review details will appear here.</p>
            </div>
          )}

          {/* Timeline tab */}
          {activeTab === "timeline" && (
            <TimelineTab caseId={id} />
          )}

          {/* Report tab */}
          {activeTab === "report" && (
            <ReportTab caseId={id} caseStatus={caseData.status} />
          )}
        </div>
      </div>
    </div>
  );
}

