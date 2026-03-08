"use client";

import { Component, type ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle,
  Clock,
  Eye,
  FolderOpen,
  RefreshCw,
  Upload,
  Users,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCaseStats } from "@/hooks/useCaseStats";
import type { UserRole } from "@/types";

// ─── Error Boundary ──────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class DashboardErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "An unexpected error occurred.",
    };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
          <AlertTriangle className="h-10 w-10 text-red-500" />
          <h2 className="text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground max-w-sm">{this.state.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Quick-action config ─────────────────────────────────────

const ROLE_QUICK_ACTIONS: Record<
  UserRole,
  { href: string; label: string; icon: React.ElementType }[]
> = {
  clinic: [
    { href: "/dashboard/upload", label: "Upload New Case", icon: Upload },
    { href: "/dashboard/cases", label: "View My Cases", icon: FolderOpen },
  ],
  specialist: [
    { href: "/dashboard/cases?queue=1", label: "Open Review Queue", icon: Clock },
    { href: "/dashboard/cases?status=completed", label: "Completed Reviews", icon: CheckCircle },
    { href: "/dashboard/cases?status=flagged", label: "Flagged Cases", icon: AlertTriangle },
  ],
  admin: [
    { href: "/dashboard/cases", label: "All Cases", icon: FolderOpen },
    { href: "/dashboard/cases?status=flagged", label: "Flagged Cases", icon: AlertTriangle },
    { href: "/dashboard/cases?status=under_review", label: "Under Review", icon: Eye },
    { href: "/dashboard/users", label: "Manage Users", icon: Users },
  ],
};

// ─── Stat Card ───────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  color: string;
  href?: string;
  trend?: number | null; // positive = up, negative = down, null = no trend
}

function StatCard({ title, value, icon: Icon, color, href, trend }: StatCardProps) {
  const content = (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-border p-5 flex items-center gap-4 hover:border-primary/40 transition-colors cursor-pointer">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-2xl font-bold">{value.toLocaleString()}</p>
        <p className="text-sm text-muted-foreground">{title}</p>
      </div>
      {trend != null && (
        <div
          className={`flex items-center gap-0.5 text-xs font-medium ${
            trend >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          }`}
        >
          {trend >= 0 ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
          {Math.abs(trend)}%
        </div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

// ─── Priority bar chart (CSS-based) ──────────────────────────

interface PriorityBarChartProps {
  data: { label: string; value: number; color: string }[];
}

function PriorityBarChart({ data }: PriorityBarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {data.map(({ label, value, color }) => (
        <div key={label} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="capitalize font-medium">{label}</span>
            <span className="text-muted-foreground font-mono">{value}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${color}`}
              style={{ width: `${(value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────

function DashboardContent() {
  const { user, loading: authLoading } = useAuth();
  const { stats, loading, error, refetch } = useCaseStats();

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Activity className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const quickActions = ROLE_QUICK_ACTIONS[user.role as UserRole] ?? ROLE_QUICK_ACTIONS.clinic;

  const priorityData = stats
    ? [
        { label: "Critical", value: stats.by_priority.critical, color: "bg-red-500" },
        { label: "High",     value: stats.by_priority.high,     color: "bg-orange-500" },
        { label: "Normal",   value: stats.by_priority.normal,   color: "bg-blue-500" },
        { label: "Low",      value: stats.by_priority.low,      color: "bg-gray-400" },
      ]
    : [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Welcome banner */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, {user.full_name ?? user.email.split("@")[0]} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1 capitalize">
            Role: <span className="font-medium">{user.role}</span>
            {user.organization ? ` · ${user.organization}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={refetch}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-60 transition-colors"
          aria-label="Refresh stats"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* 5 stats cards */}
      {loading && !stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-white dark:bg-gray-900 p-5 h-24 animate-pulse"
            />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Cases"
            value={stats.total}
            icon={FolderOpen}
            color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
            href="/dashboard/cases"
          />
          <StatCard
            title="Processing"
            value={stats.by_status.processing}
            icon={Clock}
            color="bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400"
            href="/dashboard/cases?status=processing"
          />
          <StatCard
            title="Flagged"
            value={stats.by_status.flagged}
            icon={AlertTriangle}
            color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
            href="/dashboard/cases?status=flagged"
          />
          <StatCard
            title="Under Review"
            value={stats.by_status.under_review}
            icon={Brain}
            color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
            href="/dashboard/cases?status=under_review"
          />
          <StatCard
            title="Completed"
            value={stats.by_status.completed}
            icon={CheckCircle}
            color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
            href="/dashboard/cases?status=completed"
          />
        </div>
      ) : null}

      {/* Middle row: priority chart + metrics */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Priority breakdown */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-white dark:bg-gray-900 p-5">
            <h2 className="text-base font-semibold mb-4">Cases by Priority</h2>
            <PriorityBarChart data={priorityData} />
          </div>

          {/* Key metrics */}
          <div className="rounded-xl border border-border bg-white dark:bg-gray-900 p-5 space-y-5">
            <h2 className="text-base font-semibold">Key Metrics</h2>

            <div className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Flagged Today</span>
                <span className="font-semibold text-red-600 dark:text-red-400">
                  {stats.flagged_today}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Completed This Week</span>
                <span className="font-semibold text-green-600 dark:text-green-400">
                  {stats.completed_this_week}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Avg Processing Time</span>
                <span className="font-semibold">
                  {stats.average_processing_time_hours > 0
                    ? `${stats.average_processing_time_hours}h`
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Uploaded (pending)</span>
                <span className="font-semibold">{stats.by_status.uploaded}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Auto-refreshes every 60 seconds.</p>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {quickActions.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Recent activity feed */}
      <div className="rounded-xl border border-border bg-white dark:bg-gray-900 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Recent Activity
          </h2>
          <Link href="/dashboard/cases" className="text-sm text-primary hover:underline font-medium">
            View all cases
          </Link>
        </div>
        {loading && !stats ? (
          <div className="flex items-center justify-center py-10">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : stats ? (
          <div className="divide-y divide-border">
            {[
              {
                label: "Flagged cases today",
                value: stats.flagged_today,
                sub: "Cases flagged in the last 24 hours",
                icon: AlertTriangle,
                color: "text-red-500",
                href: "/dashboard/cases?status=flagged",
              },
              {
                label: "Completed this week",
                value: stats.completed_this_week,
                sub: "Cases completed since Monday",
                icon: CheckCircle,
                color: "text-green-500",
                href: "/dashboard/cases?status=completed",
              },
              {
                label: "Under review",
                value: stats.by_status.under_review,
                sub: "Cases awaiting specialist review",
                icon: Brain,
                color: "text-amber-500",
                href: "/dashboard/cases?status=under_review",
              },
            ].map(({ label, value, sub, icon: Icon, color, href }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors"
              >
                <Icon className={`h-5 w-5 flex-shrink-0 ${color}`} aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
                <span className="font-semibold">{value}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center text-muted-foreground text-sm">
            <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>No data available.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <DashboardErrorBoundary>
      <DashboardContent />
    </DashboardErrorBoundary>
  );
}

