"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Loader2, AlertCircle } from "lucide-react";
import { get } from "@/lib/api-client";
import { RiskScoreDisplay } from "./RiskScoreDisplay";
import type { AnalysisResult, AIFindings } from "@/types";

interface AIFindingsPanelProps {
  caseId: string;
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    "critical findings":
      "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    "abnormal findings":
      "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
    "normal findings":
      "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    inconclusive:
      "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
  };

  const colorClass =
    colors[category.toLowerCase()] ??
    "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${colorClass}`}
    >
      {category}
    </span>
  );
}

function KeywordTag({ keyword }: { keyword: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
      {keyword}
    </span>
  );
}

export function AIFindingsPanel({ caseId }: AIFindingsPanelProps) {
  const [findings, setFindings] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchFindings = async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await get<AnalysisResult[]>(`/api/v1/analysis/case/${caseId}`);
        if (!cancelled) {
          setFindings(results.length > 0 ? results[0] : null);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load analysis findings.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchFindings();

    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
        <span>Loading AI findings…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-400">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!findings) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        No findings available.
      </div>
    );
  }

  const riskScore = findings.risk_score ?? 0;
  const flaggedStatus = findings.flagged_status ?? false;

  // Resolve display fields — prefer new Phase 5 fields, fall back to legacy
  const aiFindings = findings.ai_findings as AIFindings | null;
  const detectedCategory =
    aiFindings?.detected_category ??
    (aiFindings?.summary ? aiFindings.summary.split(":")[0] : "inconclusive");
  const categoryConfidence = aiFindings?.category_confidence;
  const criticalKeywords = aiFindings?.critical_keywords_found ?? [];
  const extractedEntities = aiFindings?.extracted_entities ?? [];
  const analysisSummary =
    aiFindings?.analysis_summary ?? aiFindings?.summary ?? "No summary available.";
  const modelVersion = findings.model_version ?? aiFindings?.["model_version" as keyof AIFindings];
  const processingTimeMs = findings.processing_time_ms;

  return (
    <div className="space-y-5">
      {/* AI disclaimer banner — always shown when ai_findings data is present */}
      {aiFindings && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 p-4">
          <span className="flex-shrink-0 text-amber-600 dark:text-amber-400 text-lg leading-none">
            ⚠️
          </span>
          <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-300">
            <span className="font-semibold">AI-Assisted Analysis</span> — This is a
            preliminary screening only. Not a medical diagnosis. All findings must be
            reviewed and confirmed by a qualified medical specialist before any clinical
            decision is made.
          </p>
        </div>
      )}

      {/* Flagged banner */}
      {flaggedStatus && (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-4">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">
              Flagged for Specialist Review
            </p>
            <p className="mt-0.5 text-sm text-red-600 dark:text-red-500">
              This case has been automatically assigned to a specialist based on the AI risk
              assessment.
            </p>
          </div>
        </div>
      )}

      {/* Risk score gauge + category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        <RiskScoreDisplay
          riskScore={riskScore}
          flaggedStatus={flaggedStatus}
          detectedCategory={detectedCategory}
        />

        <div className="space-y-3">
          {/* Category badge */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Detected Category
            </p>
            <CategoryBadge category={detectedCategory} />
            {categoryConfidence != null && (
              <span className="ml-2 text-xs text-muted-foreground">
                ({Math.round(categoryConfidence * 100)}% confidence)
              </span>
            )}
          </div>

          {/* Critical keywords */}
          {criticalKeywords.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Critical Keywords
              </p>
              <div className="flex flex-wrap gap-1.5">
                {criticalKeywords.map((kw) => (
                  <KeywordTag key={kw} keyword={kw} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Analysis summary */}
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Analysis Summary
        </p>
        <p className="text-sm leading-relaxed">{analysisSummary}</p>
      </div>

      {/* Extracted medical entities */}
      {extractedEntities.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Extracted Medical Entities
          </p>
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Entity</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">Label</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {extractedEntities.map((entity, i) => (
                  <tr key={i} className="bg-white dark:bg-gray-900">
                    <td className="px-4 py-2 font-mono text-xs">{entity.entity}</td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {entity.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground">
                      {Math.round(entity.confidence * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Processing metadata */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground border-t border-border pt-3">
        {modelVersion && <span>Model: {String(modelVersion)}</span>}
        {processingTimeMs != null && (
          <span>Processing time: {processingTimeMs} ms</span>
        )}
      </div>
    </div>
  );
}
