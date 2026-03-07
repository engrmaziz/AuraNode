"use client";

import { useState, useCallback } from "react";
import { CheckCircle, XCircle, Loader2, Clock } from "lucide-react";
import { get, post } from "@/lib/api-client";
import { useInterval } from "@/hooks/useInterval";
import type { OCRStatus as OCRStatusType } from "@/types";

interface OCRStatusProps {
  caseId: string;
  /** Called when OCR completes successfully so parent can refresh analysis data */
  onComplete?: () => void;
}

const POLL_INTERVAL_MS = 3000;

export function OCRStatus({ caseId, onComplete }: OCRStatusProps) {
  const [statusData, setStatusData] = useState<OCRStatusType | null>(null);
  const [retrying, setRetrying] = useState(false);

  const isTerminal =
    statusData?.status === "completed" || statusData?.status === "failed";

  const poll = useCallback(async () => {
    try {
      const data = await get<OCRStatusType>(
        `/api/v1/analysis/case/${caseId}/status`
      );
      setStatusData(data);

      if (data.status === "completed") {
        onComplete?.();
      }
    } catch {
      // Silently ignore transient errors during polling
    }
  }, [caseId, onComplete]);

  // Poll every 3 s; stop when terminal state reached
  useInterval(poll, isTerminal ? null : POLL_INTERVAL_MS);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await post(`/api/v1/analysis/case/${caseId}/reprocess`);
      setStatusData(null);
    } catch {
      // ignore
    } finally {
      setRetrying(false);
    }
  };

  // ── Render states ─────────────────────────────────────────

  if (!statusData) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
        <span>Loading OCR status…</span>
      </div>
    );
  }

  const { status, progress, message } = statusData;

  if (status === "queued") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4 text-sm">
        <Clock className="h-4 w-4 flex-shrink-0 text-gray-500" />
        <span className="text-muted-foreground">Waiting in queue…</span>
      </div>
    );
  }

  if (status === "processing") {
    return (
      <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4">
        <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400">
          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
          <span className="font-medium">Extracting text from images…</span>
        </div>
        <div className="h-2 w-full rounded-full bg-blue-200 dark:bg-blue-900 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${Math.max(progress, 10)}%` }}
          />
        </div>
      </div>
    );
  }

  if (status === "completed") {
    const confidenceMatch = message.match(/(\d+)%/);
    const confidence = confidenceMatch ? confidenceMatch[1] : null;

    return (
      <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-4 text-sm">
        <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" />
        <span className="text-green-700 dark:text-green-400 font-medium">
          OCR complete
          {confidence ? ` (confidence: ${confidence}%)` : ""}
        </span>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-4">
        <div className="flex items-start gap-3 text-sm">
          <XCircle className="h-4 w-4 flex-shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-red-700 dark:text-red-400">
              OCR processing failed
            </p>
            {message && (
              <p className="text-red-600 dark:text-red-500 text-xs">{message}</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-transparent px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-60 transition-colors"
        >
          {retrying && <Loader2 className="h-3 w-3 animate-spin" />}
          Retry
        </button>
      </div>
    );
  }

  return null;
}
