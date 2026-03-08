"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, HelpCircle, Loader2, XCircle } from "lucide-react";
import type { ReviewCreate, ReviewDecision } from "@/types";

interface ReviewFormProps {
  caseId: string;
  onSubmit: (review: ReviewCreate) => Promise<void>;
}

interface ConfirmDialogProps {
  decision: ReviewDecision;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

const DECISION_CONFIG: Record<
  ReviewDecision,
  { label: string; icon: React.ElementType; activeClass: string; confirmText: string }
> = {
  approved: {
    label: "Approve",
    icon: CheckCircle2,
    activeClass:
      "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 dark:border-green-700",
    confirmText: "approve",
  },
  rejected: {
    label: "Reject",
    icon: XCircle,
    activeClass:
      "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 dark:border-red-700",
    confirmText: "reject",
  },
  needs_more_info: {
    label: "Needs More Info",
    icon: HelpCircle,
    activeClass:
      "border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-700",
    confirmText: "request more information for",
  },
};

function ConfirmDialog({ decision, onConfirm, onCancel, loading }: ConfirmDialogProps) {
  const config = DECISION_CONFIG[decision];
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      {/* Dialog */}
      <div className="relative z-10 bg-white dark:bg-gray-900 rounded-2xl border border-border shadow-xl p-6 max-w-sm w-full">
        <div className="flex flex-col items-center text-center gap-3">
          <Icon className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Confirm Review</h2>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to{" "}
            <strong className="text-foreground">{config.confirmText}</strong> this case?
            This action will update the case status.
          </p>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReviewForm({ caseId, onSubmit }: ReviewFormProps) {
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [notes, setNotes] = useState("");
  const [riskAssessment, setRiskAssessment] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const notesValid = notes.trim().length >= 10;
  const formValid = decision !== null && notesValid;

  const handleSubmitClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid) return;
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    if (!decision) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        case_id: caseId,
        notes: notes.trim(),
        decision,
        risk_assessment: riskAssessment.trim() || undefined,
        recommendations: recommendations.trim() || undefined,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit review";
      setError(msg);
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmitClick} className="space-y-5">
        {/* Decision buttons */}
        <div>
          <p className="text-sm font-semibold mb-3">Decision *</p>
          <div className="grid grid-cols-1 gap-2">
            {(Object.entries(DECISION_CONFIG) as [ReviewDecision, typeof DECISION_CONFIG[ReviewDecision]][]).map(
              ([key, config]) => {
                const Icon = config.icon;
                const isActive = decision === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDecision(key)}
                    className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all ${
                      isActive
                        ? config.activeClass
                        : "border-border text-muted-foreground hover:border-primary/40 hover:bg-accent"
                    }`}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {config.label}
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold" htmlFor="notes">
              Notes *
            </label>
            <span
              className={`text-xs ${notes.length > 450 ? "text-orange-500" : "text-muted-foreground"}`}
            >
              {notes.length}/500
            </span>
          </div>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Minimum 10 characters required…"
            className={`w-full rounded-xl border px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 dark:bg-gray-900 ${
              notes.length > 0 && !notesValid
                ? "border-red-400 dark:border-red-600"
                : "border-border"
            }`}
          />
          {notes.length > 0 && !notesValid && (
            <p className="text-xs text-red-500 mt-1">Notes must be at least 10 characters.</p>
          )}
        </div>

        {/* Risk Assessment */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-muted-foreground" htmlFor="risk-assessment">
              Risk Assessment
              <span className="ml-1 text-xs">(optional)</span>
            </label>
            <span
              className={`text-xs ${
                riskAssessment.length > 270 ? "text-orange-500" : "text-muted-foreground"
              }`}
            >
              {riskAssessment.length}/300
            </span>
          </div>
          <textarea
            id="risk-assessment"
            value={riskAssessment}
            onChange={(e) => setRiskAssessment(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="Describe the identified risk factors…"
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 dark:bg-gray-900"
          />
        </div>

        {/* Recommendations */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-muted-foreground" htmlFor="recommendations">
              Recommendations
              <span className="ml-1 text-xs">(optional)</span>
            </label>
            <span
              className={`text-xs ${
                recommendations.length > 450 ? "text-orange-500" : "text-muted-foreground"
              }`}
            >
              {recommendations.length}/500
            </span>
          </div>
          <textarea
            id="recommendations"
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Provide clinical recommendations…"
            className="w-full rounded-xl border border-border px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 dark:bg-gray-900"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!formValid || loading}
          className="w-full rounded-xl bg-primary text-primary-foreground py-3 text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Submit Review
        </button>
      </form>

      {/* Confirmation dialog */}
      {showConfirm && decision && (
        <ConfirmDialog
          decision={decision}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          loading={loading}
        />
      )}
    </>
  );
}
