"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useReviewQueue } from "@/hooks/useReviewQueue";
import type { CasePriority, ReviewQueueItem } from "@/types";

// ─── Helpers ────────────────────────────────────────────────

const PRIORITY_BADGE: Record<CasePriority, string> = {
  low: "text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300",
  normal: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300",
  high: "text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300",
  critical: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-300",
};

const PRIORITY_ICON: Record<CasePriority, string> = {
  low: "",
  normal: "",
  high: "⚠️",
  critical: "🔴",
};

type FilterType = "all" | "flagged" | "needs_info";

// ─── Card ────────────────────────────────────────────────────

function QueueCard({ item }: { item: ReviewQueueItem }) {
  const daysSince = formatDistanceToNow(new Date(item.created_at), { addSuffix: true });
  const riskScore = item.analysis?.risk_score;

  return (
    <div className="bg-white dark:bg-gray-900 border border-border rounded-xl p-5 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Title + patient ref */}
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-base truncate max-w-xs" title={item.title}>
              {PRIORITY_ICON[item.priority]} {item.title}
            </h3>
            {item.status === "flagged" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 text-xs font-medium">
                <AlertTriangle className="h-3 w-3" />
                Flagged
              </span>
            )}
          </div>
          {item.patient_reference && (
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              Patient: {item.patient_reference}
            </p>
          )}

          {/* Meta row */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium capitalize ${PRIORITY_BADGE[item.priority]}`}
            >
              {item.priority}
            </span>
            <span>Uploaded {daysSince}</span>
            <span>{item.file_count} file{item.file_count !== 1 ? "s" : ""}</span>
            {riskScore != null && (
              <span
                className={`font-semibold ${
                  riskScore >= 0.7
                    ? "text-red-600 dark:text-red-400"
                    : riskScore >= 0.4
                    ? "text-orange-600 dark:text-orange-400"
                    : "text-green-600 dark:text-green-400"
                }`}
              >
                AI Risk: {Math.round(riskScore * 100)}%
              </span>
            )}
          </div>
        </div>

        {/* Action */}
        <Link
          href={`/review/${item.id}`}
          className="flex-shrink-0 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Start Review
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────

export default function ReviewQueuePage() {
  const { queue, loading, error, refetch } = useReviewQueue();
  const [filter, setFilter] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState<"priority" | "date">("priority");

  const filtered = queue.filter((item) => {
    if (filter === "flagged") return item.status === "flagged";
    if (filter === "needs_info") return item.status === "under_review";
    return true;
  });

  const PRIORITY_WEIGHT: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 };
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "priority") {
      const pw = (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2);
      if (pw !== 0) return pw;
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const FILTERS: { id: FilterType; label: string }[] = [
    { id: "all", label: "All" },
    { id: "flagged", label: "Flagged Only" },
    { id: "needs_info", label: "Needs Info" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Review Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Loading…" : `${queue.length} case${queue.length !== 1 ? "s" : ""} awaiting review`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "priority" | "date")}
            className="rounded-lg border border-border bg-white dark:bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="priority">Sort: Priority</option>
            <option value="date">Sort: Date</option>
          </select>
          <button
            type="button"
            onClick={refetch}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60 transition-colors"
            aria-label="Refresh queue"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {FILTERS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === id
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-900 border border-border rounded-xl p-5 h-28 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Queue items */}
      {!loading && sorted.length > 0 && (
        <div className="space-y-3">
          {sorted.map((item) => (
            <QueueCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && sorted.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Loader2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">No cases in queue.</p>
          <p className="text-sm text-muted-foreground mt-1">Check back later.</p>
        </div>
      )}
    </div>
  );
}
