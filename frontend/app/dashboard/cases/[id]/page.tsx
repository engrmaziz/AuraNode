"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  AlertCircle,
  Calendar,
  User,
} from "lucide-react";
import { StatusBadge } from "@/components/cases/StatusBadge";
import { useCase } from "@/hooks/useCases";
import { get } from "@/lib/api-client";
import type { CaseStatus } from "@/types";

// ─── Types ──────────────────────────────────────────────────

type Tab = "files" | "analysis" | "review" | "report";

const TABS: { id: Tab; label: string }[] = [
  { id: "files", label: "Files" },
  { id: "analysis", label: "Analysis" },
  { id: "review", label: "Review" },
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
  flagged: 2,
  under_review: 3,
  completed: 4,
  deleted: -1,
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

// ─── Page ───────────────────────────────────────────────────

export default function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { case: caseData, loading, error } = useCase(id);
  const [activeTab, setActiveTab] = useState<Tab>("files");
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

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
              onClick={() => setActiveTab(tabId)}
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

          {/* Other tabs — placeholder */}
          {activeTab === "analysis" && (
            <div className="py-16 text-center text-muted-foreground">
              <p className="font-medium">Analysis results will appear here once processing is complete.</p>
            </div>
          )}
          {activeTab === "review" && (
            <div className="py-16 text-center text-muted-foreground">
              <p className="font-medium">Specialist review details will appear here.</p>
            </div>
          )}
          {activeTab === "report" && (
            <div className="py-16 text-center text-muted-foreground">
              <p className="font-medium">Generated reports will appear here once analysis is complete.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
