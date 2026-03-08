"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { get } from "@/lib/api-client";
import type { Review, ReviewSummary } from "@/types";

// ─── Donut chart (SVG-based) ─────────────────────────────────

interface DonutChartProps {
  segments: { label: string; value: number; color: string }[];
  total: number;
}

function DonutChart({ segments, total }: DonutChartProps) {
  const size = 160;
  const strokeWidth = 28;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = segments.map((seg) => {
    const pct = total > 0 ? seg.value / total : 0;
    const dashArray = pct * circumference;
    const dashOffset = circumference - offset * circumference;
    offset += pct;
    return { ...seg, dashArray, dashOffset };
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arc.dashArray} ${circumference - arc.dashArray}`}
            strokeDashoffset={arc.dashOffset}
            style={{ transition: "stroke-dasharray 0.5s ease" }}
          />
        ))}
        {/* Center text (rotated back) */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground text-2xl font-bold"
          fontSize="24"
          transform={`rotate(90, ${size / 2}, ${size / 2})`}
        >
          {total}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 18}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-muted-foreground text-xs"
          fontSize="10"
          transform={`rotate(90, ${size / 2}, ${size / 2})`}
        >
          total
        </text>
      </svg>
      {/* Legend */}
      <div className="space-y-1.5 w-full max-w-[180px]">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                style={{ background: seg.color }}
              />
              <span className="text-muted-foreground capitalize">{seg.label}</span>
            </div>
            <span className="font-medium tabular-nums">
              {seg.value}
              {total > 0 && (
                <span className="text-xs text-muted-foreground ml-1">
                  ({Math.round((seg.value / total) * 100)}%)
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Recent activity ─────────────────────────────────────────

function RecentActivity({ reviews }: { reviews: Review[] }) {
  if (!reviews.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">No recent reviews.</p>
    );
  }

  return (
    <div className="divide-y divide-border">
      {reviews.map((r) => (
        <div key={r.id} className="flex items-center gap-3 py-3">
          {r.decision === "approved" ? (
            <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
          ) : r.decision === "rejected" ? (
            <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          ) : (
            <HelpCircle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              Case <span className="font-mono text-xs">{r.case_id.slice(0, 8)}…</span>
            </p>
            <p className="text-xs text-muted-foreground capitalize">
              {r.decision?.replace(/_/g, " ")} ·{" "}
              {formatDistanceToNow(new Date(r.reviewed_at), { addSuffix: true })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  colorClass,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  colorClass: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-border rounded-xl p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${colorClass}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────

export default function ReviewStatsPage() {
  const [stats, setStats] = useState<ReviewSummary | null>(null);
  const [recentReviews, setRecentReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statsData = await get<ReviewSummary>("/api/v1/reviews/stats");
      setStats(statsData);
      // Recent activity requires a dedicated endpoint not yet implemented;
      // for now we surface an empty list.
      setRecentReviews([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Activity className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center">
        <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
        <p className="font-semibold text-red-600">{error}</p>
        <button
          type="button"
          onClick={fetchStats}
          className="mt-4 text-primary text-sm hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const segments = stats
    ? [
        { label: "Approved", value: stats.approved, color: "#22c55e" },
        { label: "Rejected", value: stats.rejected, color: "#ef4444" },
        { label: "Needs Info", value: stats.needs_more_info, color: "#eab308" },
      ]
    : [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">My Stats</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your review performance overview
          </p>
        </div>
        <button
          type="button"
          onClick={fetchStats}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Reviews"
            value={stats.total_reviews}
            icon={Activity}
            colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          />
          <StatCard
            label="Approved"
            value={stats.approved}
            icon={CheckCircle2}
            colorClass="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
          />
          <StatCard
            label="Rejected"
            value={stats.rejected}
            icon={XCircle}
            colorClass="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          />
          <StatCard
            label="Needs Info"
            value={stats.needs_more_info}
            icon={HelpCircle}
            colorClass="bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400"
          />
        </div>
      )}

      {/* Chart + metrics */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Donut chart */}
          <div className="bg-white dark:bg-gray-900 border border-border rounded-xl p-6">
            <h2 className="text-base font-semibold mb-5">Decision Breakdown</h2>
            {stats.total_reviews > 0 ? (
              <div className="flex justify-center">
                <DonutChart segments={segments} total={stats.total_reviews} />
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No reviews yet.
              </div>
            )}
          </div>

          {/* Key metrics */}
          <div className="bg-white dark:bg-gray-900 border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold">Key Metrics</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Avg. Review Time</span>
                <span className="font-semibold">
                  {stats.average_review_time_hours > 0
                    ? `${stats.average_review_time_hours}h`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Approval Rate</span>
                <span className="font-semibold text-green-600 dark:text-green-400">
                  {stats.total_reviews > 0
                    ? `${Math.round((stats.approved / stats.total_reviews) * 100)}%`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rejection Rate</span>
                <span className="font-semibold text-red-600 dark:text-red-400">
                  {stats.total_reviews > 0
                    ? `${Math.round((stats.rejected / stats.total_reviews) * 100)}%`
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="bg-white dark:bg-gray-900 border border-border rounded-xl p-5">
        <h2 className="text-base font-semibold mb-3">Recent Activity</h2>
        <RecentActivity reviews={recentReviews} />
      </div>
    </div>
  );
}
