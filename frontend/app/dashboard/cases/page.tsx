"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  FolderOpen,
  Loader2,
  AlertCircle,
  Upload,
} from "lucide-react";
import { StatusBadge } from "@/components/cases/StatusBadge";
import { CaseFilters } from "@/components/cases/CaseFilters";
import { BulkActions } from "@/components/cases/BulkActions";
import { useCases } from "@/hooks/useCases";
import { get } from "@/lib/api-client";
import { useAuth } from "@/hooks/useAuth";
import type { Case, CasePriority, FilterState, User } from "@/types";

// ─── Helpers ────────────────────────────────────────────────

const PRIORITY_BADGE: Record<string, string> = {
  low: "text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300",
  normal: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300",
  high: "text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-300",
  critical: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-300",
};

type SortField = "created_at" | "priority" | "status";
type SortDir = "asc" | "desc";

const PRIORITY_WEIGHT: Record<string, number> = {
  critical: 0, high: 1, normal: 2, low: 3,
};
const STATUS_WEIGHT: Record<string, number> = {
  flagged: 0, under_review: 1, processing: 2, uploaded: 3, completed: 4, deleted: 5,
};

function sortCases(cases: Case[], field: SortField, dir: SortDir): Case[] {
  return [...cases].sort((a, b) => {
    let cmp = 0;
    if (field === "created_at") {
      cmp = a.created_at.localeCompare(b.created_at);
    } else if (field === "priority") {
      cmp = (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2);
    } else if (field === "status") {
      cmp = (STATUS_WEIGHT[a.status] ?? 5) - (STATUS_WEIGHT[b.status] ?? 5);
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

function exportCSV(cases: Case[]): void {
  const headers = ["ID", "Title", "Patient Ref", "Status", "Priority", "Specialist ID", "Created At"];
  const rows = cases.map((c) => [
    c.id,
    `"${c.title.replace(/"/g, '""')}"`,
    c.patient_reference ?? "",
    c.status,
    c.priority,
    c.assigned_specialist_id ?? "",
    new Date(c.created_at).toISOString(),
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cases-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Skeleton ───────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i} className="border-b border-border last:border-0">
          {Array.from({ length: 8 }).map((_, j) => (
            <td key={j} className="px-4 py-3.5">
              <div className="h-4 rounded bg-muted animate-pulse" style={{ width: `${60 + (j * 13) % 40}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ─── Sort header ─────────────────────────────────────────────

function SortableHeader({
  field,
  label,
  current,
  dir,
  onSort,
}: {
  field: SortField;
  label: string;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = current === field;
  return (
    <th
      className="text-left px-4 py-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none"
      onClick={() => onSort(field)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          dir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 opacity-30" />
        )}
      </span>
    </th>
  );
}

// ─── Page ───────────────────────────────────────────────────

export default function CasesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // ─── Filter state synced to URL ──────────────────────────
  const parseFilters = useCallback((): FilterState => ({
    status: searchParams.getAll("status"),
    priority: searchParams.get("priority") ?? "",
    search: searchParams.get("search") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
  }), [searchParams]);

  const [filters, setFilters] = useState<FilterState>(parseFilters);
  const [page, setPage] = useState(Number(searchParams.get("page") ?? 1));
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [specialists, setSpecialists] = useState<User[]>([]);

  // Sync URL → state when navigating back/forward
  useEffect(() => {
    setFilters(parseFilters());
    setPage(Number(searchParams.get("page") ?? 1));
  }, [searchParams, parseFilters]);

  // Sync state → URL
  const pushParams = useCallback((newFilters: FilterState, newPage: number) => {
    const params = new URLSearchParams();
    newFilters.status.forEach((s) => params.append("status", s));
    if (newFilters.priority) params.set("priority", newFilters.priority);
    if (newFilters.search) params.set("search", newFilters.search);
    if (newFilters.dateFrom) params.set("dateFrom", newFilters.dateFrom);
    if (newFilters.dateTo) params.set("dateTo", newFilters.dateTo);
    if (newPage > 1) params.set("page", String(newPage));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname]);

  const handleFiltersChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setPage(1);
    pushParams(newFilters, 1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    pushParams(filters, newPage);
  };

  // Resolve active status filter for hook (join with OR — use first if single)
  const statusParam = filters.status.length === 1 ? filters.status[0] : undefined;

  const { cases: rawCases, total, has_next, loading, error, refetch } = useCases({
    status: statusParam,
    priority: filters.priority || undefined,
    search: filters.search || undefined,
    page,
    per_page: 20,
  });

  // Client-side multi-status filter when multiple statuses selected
  const filteredCases = filters.status.length > 1
    ? rawCases.filter((c) => filters.status.includes(c.status))
    : rawCases;

  // Client-side date filter — parse boundary dates once outside the loop
  const dateFromBoundary = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const dateToBoundary = filters.dateTo ? new Date(filters.dateTo + "T23:59:59") : null;
  const dateFilteredCases = filteredCases.filter((c) => {
    const created = new Date(c.created_at);
    if (dateFromBoundary && created < dateFromBoundary) return false;
    if (dateToBoundary && created > dateToBoundary) return false;
    return true;
  });

  const sortedCases = sortCases(dateFilteredCases, sortField, sortDir);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  // Reset to page 1 when filters change (except page itself)
  const statusKey = filters.status.join(",");
  useEffect(() => { setPage(1); }, [statusKey, filters.priority, filters.search, filters.dateFrom, filters.dateTo]);

  // Load specialists for bulk-assign (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    get<{ users?: User[]; data?: User[] }>("/api/v1/auth/users?role=specialist")
      .then((res) => {
        const list = res.users ?? res.data ?? [];
        setSpecialists(list.filter((u) => u.role === "specialist"));
      })
      .catch(() => {});
  }, [isAdmin]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  // Selection
  const allSelected = sortedCases.length > 0 && sortedCases.every((c) => selectedIds.has(c.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedCases.map((c) => c.id)));
    }
  };
  const toggleCase = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedCases = sortedCases.filter((c) => selectedIds.has(c.id));

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Cases</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? "Loading…" : `${total} case${total !== 1 ? "s" : ""} found`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={() => exportCSV(sortedCases)}
              disabled={sortedCases.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40 transition-colors"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          )}
          <Link
            href="/dashboard/upload"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            <Upload className="h-4 w-4" />
            Upload New Case
          </Link>
        </div>
      </div>

      {/* Advanced filters */}
      <CaseFilters filters={filters} onChange={handleFiltersChange} />

      {/* Bulk actions (admin) */}
      {isAdmin && (
        <BulkActions
          selectedCases={selectedCases}
          specialists={specialists}
          onClear={() => setSelectedIds(new Set())}
          onActionComplete={() => {
            setSelectedIds(new Set());
            refetch();
          }}
        />
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-white dark:bg-gray-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {isAdmin && (
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded border-border accent-primary"
                      aria-label="Select all cases"
                    />
                  </th>
                )}
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Case ID</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Patient Ref</th>
                <SortableHeader field="status" label="Status" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader field="priority" label="Priority" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortableHeader field="created_at" label="Created" current={sortField} dir={sortDir} onSort={handleSort} />
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableSkeleton />
              ) : sortedCases.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="py-16 text-center text-muted-foreground">
                    <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No cases found</p>
                    <p className="text-xs mt-1">
                      {filters.search || filters.status.length > 0 || filters.priority
                        ? "Try adjusting your filters."
                        : "Upload your first case to get started."}
                    </p>
                  </td>
                </tr>
              ) : (
                sortedCases.map((c) => (
                  <tr
                    key={c.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors ${
                      selectedIds.has(c.id) ? "bg-primary/5" : ""
                    }`}
                    onClick={() => router.push(`/dashboard/cases/${c.id}`)}
                  >
                    {isAdmin && (
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleCase(c.id)}
                          className="rounded border-border accent-primary"
                          aria-label={`Select case ${c.title}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
                      {c.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3.5 font-medium max-w-[200px] truncate" title={c.title}>
                      {c.title}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground font-mono text-xs">
                      {c.patient_reference ?? "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                          PRIORITY_BADGE[c.priority] ?? ""
                        }`}
                      >
                        {c.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground text-xs">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/dashboard/cases/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-primary text-xs font-medium hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && total > 20 && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {total} cases
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handlePageChange(Math.max(1, page - 1))}
                disabled={page === 1}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                const p = start + i;
                return (
                  <button
                    key={p}
                    onClick={() => handlePageChange(p)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      p === page
                        ? "bg-primary text-primary-foreground"
                        : "border border-border hover:bg-accent"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}

              <button
                onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                disabled={!has_next}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

