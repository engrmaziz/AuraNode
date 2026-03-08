"use client";

import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle,
  Circle,
  ClipboardList,
  FileText,
  Flag,
  Loader2,
  Brain,
  Upload,
  User,
  FileCheck,
} from "lucide-react";
import type { TimelineEvent } from "@/types";

// ─── Event type metadata ─────────────────────────────────────

interface EventMeta {
  icon: React.ElementType;
  label: string;
  color: string; // Tailwind bg + text classes for the icon circle
}

const EVENT_META: Record<string, EventMeta> = {
  case_created:        { icon: Circle,      label: "Case Created",        color: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" },
  file_uploaded:       { icon: Upload,      label: "File Uploaded",       color: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400" },
  ocr_started:         { icon: Loader2,     label: "OCR Started",         color: "bg-yellow-100 text-yellow-600 dark:bg-yellow-900/40 dark:text-yellow-400" },
  ocr_completed:       { icon: CheckCircle, label: "OCR Completed",       color: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400" },
  ai_analyzed:         { icon: Brain,       label: "AI Analysis Done",    color: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400" },
  flagged:             { icon: Flag,        label: "Case Flagged",        color: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" },
  specialist_assigned: { icon: User,        label: "Specialist Assigned", color: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400" },
  review_submitted:    { icon: ClipboardList, label: "Review Submitted",  color: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400" },
  report_generated:    { icon: FileText,    label: "Report Generated",    color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  completed:           { icon: FileCheck,   label: "Case Completed",      color: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400" },
  // Generic fallback aliases from backend
  status_changed:      { icon: Circle,      label: "Status Changed",      color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
};

const DEFAULT_META: EventMeta = {
  icon: Circle,
  label: "Event",
  color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

function getEventMeta(action: string): EventMeta {
  return EVENT_META[action] ?? DEFAULT_META;
}

function formatTimestamp(ts: string): string {
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return ts;
  }
}

function formatAbsoluteTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function buildDescription(event: TimelineEvent): string {
  const { action, metadata } = event;
  switch (action) {
    case "status_changed":
      return `Status changed from "${metadata.from_status}" to "${metadata.to_status}"`;
    case "specialist_assigned":
      return `Assigned to ${(metadata.specialist_name as string) ?? "a specialist"}`;
    case "file_uploaded":
      return `File "${(metadata.file_name as string) ?? "unknown"}" uploaded`;
    case "ocr_started":
      return "OCR processing started";
    case "ocr_completed":
      return "OCR processing completed successfully";
    case "ai_analyzed":
      return "AI analysis completed";
    case "review_submitted":
      return `Review submitted${metadata.decision ? ` — ${metadata.decision}` : ""}`;
    case "report_generated":
      return "Diagnostic report generated";
    case "case_created":
      return "Case created";
    case "flagged":
      return "Case flagged for specialist review";
    case "completed":
      return "Case marked as completed";
    default:
      return action.replace(/_/g, " ");
  }
}

// ─── Props ───────────────────────────────────────────────────

interface CaseTimelineProps {
  events: TimelineEvent[];
  loading?: boolean;
}

// ─── Component ───────────────────────────────────────────────

export function CaseTimeline({ events, loading = false }: CaseTimelineProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-8 w-8 rounded-full bg-muted animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 w-40 rounded bg-muted animate-pulse" />
              <div className="h-3 w-64 rounded bg-muted animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Circle className="h-8 w-8 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No timeline events yet</p>
        <p className="text-xs mt-1">Activity will appear here as the case progresses.</p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-0">
      {events.map((event, idx) => {
        const meta = getEventMeta(event.action);
        const Icon = meta.icon;
        const isLast = idx === events.length - 1;

        return (
          <li key={`${event.action}-${event.timestamp}-${idx}`} className="flex gap-4">
            {/* Icon column */}
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${meta.color}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
              {!isLast && <div className="w-0.5 flex-1 bg-border my-1" />}
            </div>

            {/* Content */}
            <div className={`pb-6 min-w-0 ${isLast ? "pb-0" : ""}`}>
              <p className="text-sm font-semibold leading-tight">{meta.label}</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {buildDescription(event)}
              </p>
              <p
                className="text-xs text-muted-foreground mt-1"
                title={formatAbsoluteTimestamp(event.timestamp)}
              >
                {formatTimestamp(event.timestamp)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
