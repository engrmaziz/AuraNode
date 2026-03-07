import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, parseISO } from "date-fns";

/**
 * Merge Tailwind CSS classes with deduplication.
 * Uses clsx for conditional logic + tailwind-merge to resolve conflicts.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format an ISO date string to a human-readable format.
 * @param dateString - ISO 8601 date string
 * @param formatStr - date-fns format string (default: "MMM d, yyyy")
 */
export function formatDate(dateString: string, formatStr: string = "MMM d, yyyy"): string {
  try {
    return format(parseISO(dateString), formatStr);
  } catch {
    return "Invalid date";
  }
}

/**
 * Format an ISO date string as a relative time (e.g., "2 hours ago").
 */
export function formatRelativeDate(dateString: string): string {
  try {
    return formatDistanceToNow(parseISO(dateString), { addSuffix: true });
  } catch {
    return "Unknown";
  }
}

/**
 * Format a file size in bytes to a human-readable string.
 * @param bytes - File size in bytes
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get Tailwind CSS color classes for a case status.
 */
export function getStatusColor(status: string): string {
  const statusColors: Record<string, string> = {
    uploaded: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    processing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    flagged: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    under_review: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  };

  return statusColors[status] ?? "bg-gray-100 text-gray-800";
}

/**
 * Get Tailwind CSS color classes for a priority level.
 */
export function getPriorityColor(priority: string): string {
  const priorityColors: Record<string, string> = {
    low: "text-gray-500",
    normal: "text-blue-500",
    high: "text-orange-500",
    critical: "text-red-600 font-semibold",
  };

  return priorityColors[priority] ?? "text-gray-500";
}

/**
 * Get Tailwind CSS color classes for a risk score (0–1).
 */
export function getRiskColor(score: number): string {
  if (score >= 0.8) return "text-red-600 dark:text-red-400";
  if (score >= 0.6) return "text-orange-500 dark:text-orange-400";
  if (score >= 0.4) return "text-yellow-500 dark:text-yellow-400";
  return "text-green-600 dark:text-green-400";
}

/**
 * Truncate a string to a maximum length, appending "…" if truncated.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "…";
}

/**
 * Capitalize the first letter of a string.
 */
export function capitalize(text: string): string {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Format a status string for display (replace underscores, capitalize).
 */
export function formatStatus(status: string): string {
  return status
    .split("_")
    .map(capitalize)
    .join(" ");
}

/**
 * Generate initials from a full name (up to 2 characters).
 */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Check if a file type is an accepted diagnostic image format.
 */
export function isValidDiagnosticFile(fileType: string): boolean {
  const accepted = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/tiff",
    "image/bmp",
    "application/pdf",
    "image/dicom",
  ];
  return accepted.includes(fileType.toLowerCase());
}

/**
 * Build a full Supabase Storage public URL for an object.
 */
export function getStorageUrl(bucket: string, path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}
