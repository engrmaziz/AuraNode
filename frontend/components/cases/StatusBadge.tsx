"use client";

import type { CaseStatus } from "@/types";

interface StatusBadgeProps {
  status: CaseStatus | string;
  className?: string;
}

const STATUS_STYLES: Record<string, string> = {
  uploaded: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  processing:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 animate-pulse",
  flagged: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  under_review:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  completed:
    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  deleted: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500 line-through",
};

const STATUS_LABELS: Record<string, string> = {
  uploaded: "Uploaded",
  processing: "Processing",
  flagged: "Flagged",
  under_review: "Under Review",
  completed: "Completed",
  deleted: "Deleted",
};

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const styles = STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700";
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, " ");

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${styles} ${className}`}
    >
      {label}
    </span>
  );
}
