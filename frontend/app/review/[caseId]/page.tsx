"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import { ImageViewer } from "@/components/review/ImageViewer";
import { ReviewForm } from "@/components/review/ReviewForm";
import { AIFindingsPanel } from "@/components/analysis/AIFindingsPanel";
import { ExtractedTextViewer } from "@/components/analysis/ExtractedTextViewer";
import { StatusBadge } from "@/components/cases/StatusBadge";
import { get, post } from "@/lib/api-client";
import type {
  AnalysisResult,
  CaseFile,
  CasePriority,
  Review,
  ReviewCreate,
} from "@/types";

// ─── Types ──────────────────────────────────────────────────

interface CaseDetail {
  id: string;
  title: string;
  description: string | null;
  patient_reference: string | null;
  status: string;
  priority: CasePriority;
  clinic_id: string;
  created_at: string;
  updated_at: string;
  assigned_specialist_id: string | null;
}

// ─── Priority badge ──────────────────────────────────────────

const PRIORITY_BADGE: Record<CasePriority, string> = {
  low: "text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300",
  normal: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300",
  high: "text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300",
  critical: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-300",
};

// ─── Previous reviews section ────────────────────────────────

function PreviousReviews({ reviews }: { reviews: Review[] }) {
  const [open, setOpen] = useState(false);
  if (!reviews.length) return null;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-medium"
      >
        <span>Previous Reviews ({reviews.length})</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="divide-y divide-border">
          {reviews.map((r) => (
            <div key={r.id} className="p-4 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.decision === "approved"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : r.decision === "rejected"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                  }`}
                >
                  {r.decision?.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-muted-foreground">
                  by {r.specialist_name ?? "Specialist"} ·{" "}
                  {formatDistanceToNow(new Date(r.reviewed_at), { addSuffix: true })}
                </span>
              </div>
              {r.notes && <p className="text-sm text-muted-foreground">{r.notes}</p>}
              {r.risk_assessment && (
                <p className="text-xs text-muted-foreground">
                  <strong>Risk:</strong> {r.risk_assessment}
                </p>
              )}
              {r.recommendations && (
                <p className="text-xs text-muted-foreground">
                  <strong>Recommendations:</strong> {r.recommendations}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────

export default function CaseReviewPage() {
  const params = useParams();
  const router = useRouter();
  const caseId = params?.caseId as string;

  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [files, setFiles] = useState<CaseFile[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"image" | "text">("image");

  const fetchData = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    setError(null);
    try {
      const [caseResp, analysisResp, reviewsResp] = await Promise.all([
        get<CaseDetail & { files?: CaseFile[] }>(`/api/v1/cases/${caseId}`),
        get<AnalysisResult>(`/api/v1/analysis/${caseId}`).catch(() => null),
        get<Review[]>(`/api/v1/reviews/case/${caseId}`).catch(() => []),
      ]);

      setCaseData(caseResp);
      setFiles(caseResp.files ?? []);
      setAnalysis(analysisResp);
      setReviews(reviewsResp ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load case");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmitReview = async (review: ReviewCreate) => {
    await post("/api/v1/reviews/", review);
    router.push("/review");
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
        <p className="font-semibold">{error ?? "Case not found"}</p>
        <button
          type="button"
          onClick={() => router.push("/review")}
          className="mt-4 text-primary text-sm hover:underline"
        >
          ← Back to queue
        </button>
      </div>
    );
  }

  const imageFiles = files.filter(
    (f) =>
      f.file_type.startsWith("image/") ||
      /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.file_name)
  );
  const extractedText = analysis?.extracted_text ?? "";
  const confidence = analysis?.confidence_score ?? 0;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => router.push("/review")}
          className="hover:text-foreground transition-colors"
        >
          ← Queue
        </button>
        <span>/</span>
        <span className="text-foreground font-medium truncate max-w-xs">{caseData.title}</span>
      </div>

      {/* Split panel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* ── LEFT PANEL (60%) ── */}
        <div className="lg:col-span-3 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-border">
            {(["image", "text"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "image" ? "Image Viewer" : "Extracted Text"}
              </button>
            ))}
          </div>

          {activeTab === "image" ? (
            imageFiles.length > 0 ? (
              <ImageViewer images={imageFiles} />
            ) : (
              <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-border bg-muted text-muted-foreground">
                <FileText className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">No image files for this case.</p>
              </div>
            )
          ) : (
            <ExtractedTextViewer
              text={extractedText}
              confidence={confidence}
            />
          )}
        </div>

        {/* ── RIGHT PANEL (40%) ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Case info */}
          <div className="bg-white dark:bg-gray-900 border border-border rounded-xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h1 className="font-bold text-base leading-tight">{caseData.title}</h1>
              <StatusBadge status={caseData.status} className="flex-shrink-0" />
            </div>
            {caseData.patient_reference && (
              <p className="text-xs text-muted-foreground font-mono">
                Patient: {caseData.patient_reference}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium capitalize ${PRIORITY_BADGE[caseData.priority]}`}
              >
                {caseData.priority}
              </span>
              <span>
                Uploaded {formatDistanceToNow(new Date(caseData.created_at), { addSuffix: true })}
              </span>
              <span>{files.length} file{files.length !== 1 ? "s" : ""}</span>
            </div>
            {caseData.description && (
              <p className="text-sm text-muted-foreground border-t border-border pt-2 mt-2">
                {caseData.description}
              </p>
            )}
          </div>

          {/* AI findings */}
          {analysis && (
            <div className="bg-white dark:bg-gray-900 border border-border rounded-xl p-4">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                AI Findings
              </h2>
              <AIFindingsPanel findings={analysis} />
            </div>
          )}

          {/* Review form */}
          <div className="bg-white dark:bg-gray-900 border border-border rounded-xl p-4">
            <h2 className="text-sm font-semibold mb-4">Submit Review</h2>
            <ReviewForm caseId={caseId} onSubmit={handleSubmitReview} />
          </div>

          {/* Previous reviews */}
          <PreviousReviews reviews={reviews} />
        </div>
      </div>
    </div>
  );
}
