"use client";

import { useEffect, useState } from "react";
import { FileText, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import type { UploadProgress } from "@/types";

interface FilePreviewProps {
  file: File;
  progress: UploadProgress;
  onRemove?: () => void;
  disabled?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_ICONS = {
  pending: null,
  uploading: <Loader2 className="h-4 w-4 animate-spin text-blue-500" aria-label="Uploading" />,
  success: <CheckCircle className="h-4 w-4 text-green-500" aria-label="Upload complete" />,
  error: <AlertCircle className="h-4 w-4 text-red-500" aria-label="Upload error" />,
};

export function FilePreview({ file, progress, onRemove, disabled = false }: FilePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = file.type.startsWith("image/");

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  const statusIcon = STATUS_ICONS[progress.status] ?? null;

  const progressBarColor =
    progress.status === "error"
      ? "bg-red-500"
      : progress.status === "success"
      ? "bg-green-500"
      : "bg-primary";

  return (
    <div
      className={`
        relative flex items-start gap-3 rounded-xl border p-3 transition-colors
        ${progress.status === "error" ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/10" : "border-border bg-background"}
      `}
    >
      {/* Thumbnail or icon */}
      <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg border border-border bg-muted flex items-center justify-center">
        {isImage && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={file.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <FileText className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium" title={file.name}>
            {file.name}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {statusIcon}
            {onRemove && progress.status !== "uploading" && (
              <button
                type="button"
                onClick={onRemove}
                disabled={disabled}
                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {formatBytes(file.size)} · {file.type.split("/")[1]?.toUpperCase()}
        </p>

        {/* Progress bar */}
        {progress.status !== "pending" && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-300 ${progressBarColor}`}
              style={{ width: `${progress.progress}%` }}
              role="progressbar"
              aria-valuenow={progress.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        )}

        {/* Error message */}
        {progress.status === "error" && progress.error && (
          <p className="text-xs text-red-600 dark:text-red-400">{progress.error}</p>
        )}
      </div>
    </div>
  );
}
