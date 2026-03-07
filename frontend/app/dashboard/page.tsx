"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  FolderOpen,
  Upload,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { Case, CaseStatus, UserRole } from "@/types";
import { get } from "@/lib/api-client";

interface DashboardStats {
  total: number;
  pending: number;
  flagged: number;
  completed: number;
}

const STATUS_BADGE: Record<CaseStatus, string> = {
  uploaded: "status-uploaded",
  processing: "status-processing",
  flagged: "status-flagged",
  under_review: "status-under_review",
  completed: "status-completed",
  deleted: "status-badge bg-gray-100 text-gray-500",
};

const ROLE_QUICK_ACTIONS: Record<UserRole, { href: string; label: string; icon: React.ElementType }[]> = {
  clinic: [
    { href: "/dashboard/upload", label: "Upload New Case", icon: Upload },
    { href: "/dashboard/cases", label: "View My Cases", icon: FolderOpen },
  ],
  specialist: [
    { href: "/dashboard/queue", label: "Open Review Queue", icon: Clock },
    { href: "/dashboard/completed", label: "Completed Reviews", icon: CheckCircle },
  ],
  admin: [
    { href: "/dashboard/cases", label: "All Cases", icon: FolderOpen },
    { href: "/dashboard/users", label: "Manage Users", icon: Activity },
  ],
};

function StatCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-border p-5 flex items-center gap-4 card-hover">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-muted-foreground">{title}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({ total: 0, pending: 0, flagged: 0, completed: 0 });
  const [recentCases, setRecentCases] = useState<Case[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        const cases = await get<Case[]>("/api/v1/cases?per_page=5");
        const all = await get<Case[]>("/api/v1/cases?per_page=200");

        setRecentCases(cases.slice(0, 5));
        setStats({
          total: all.length,
          pending: all.filter((c) => c.status === "uploaded" || c.status === "processing").length,
          flagged: all.filter((c) => c.status === "flagged").length,
          completed: all.filter((c) => c.status === "completed").length,
        });
      } catch {
        // Silently ignore — API may not be reachable in preview
      } finally {
        setLoadingStats(false);
      }
    };

    loadData();
  }, [user]);

  if (!user) return null;

  const quickActions = ROLE_QUICK_ACTIONS[user.role as UserRole] ?? ROLE_QUICK_ACTIONS.clinic;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Welcome banner */}
      <div>
        <h1 className="text-2xl font-bold">
          Welcome back, {user.full_name ?? user.email.split("@")[0]} 👋
        </h1>
        <p className="text-muted-foreground text-sm mt-1 capitalize">
          Role: <span className="font-medium">{user.role}</span>
          {user.organization ? ` · ${user.organization}` : ""}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Cases"
          value={stats.total}
          icon={FolderOpen}
          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
        />
        <StatCard
          title="In Progress"
          value={stats.pending}
          icon={Clock}
          color="bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400"
        />
        <StatCard
          title="Flagged"
          value={stats.flagged}
          icon={AlertTriangle}
          color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
        />
        <StatCard
          title="Completed"
          value={stats.completed}
          icon={CheckCircle}
          color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
        />
      </div>

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

      {/* Recent cases table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Cases</h2>
          <Link
            href="/dashboard/cases"
            className="text-sm text-primary hover:underline font-medium"
          >
            View all
          </Link>
        </div>

        {loadingStats ? (
          <div className="flex items-center justify-center py-12">
            <Activity className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : recentCases.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No cases yet.</p>
            {user.role === "clinic" && (
              <Link href="/dashboard/upload" className="mt-2 inline-block text-primary hover:underline">
                Upload your first case →
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Title</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Priority</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentCases.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-5 py-3 font-medium">
                      <Link href={`/dashboard/cases/${c.id}`} className="hover:underline">
                        {c.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3 capitalize text-muted-foreground">{c.priority}</td>
                    <td className="px-5 py-3">
                      <span className={STATUS_BADGE[c.status] ?? "status-badge bg-gray-100 text-gray-800"}>
                        {c.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
