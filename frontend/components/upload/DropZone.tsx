"use client";

import { useCallback } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload, X, AlertCircle } from "lucide-react";

interface DropZoneProps {
  onFilesAccepted: (files: File[]) => void;
  maxFiles?: number;
  maxSize?: number;
  accept?: Record<string, string[]>;
  currentFiles?: File[];
  disabled?: boolean;
}

const DEFAULT_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/pdf": [".pdf"],
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DropZone({
  onFilesAccepted,
  maxFiles = 5,
  maxSize = 10 * 1024 * 1024,
  accept = DEFAULT_ACCEPT,
  currentFiles = [],
  disabled = false,
}: DropZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length > 0) return; // errors shown via fileRejections state
      onFilesAccepted(acceptedFiles);
    },
    [onFilesAccepted]
  );

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragAccept,
    isDragReject,
    fileRejections,
  } = useDropzone({
    onDrop,
    accept,
    maxFiles: maxFiles - currentFiles.length,
    maxSize,
    disabled,
    multiple: true,
  });

  const borderColor = isDragReject
    ? "border-red-400 bg-red-50 dark:bg-red-900/10"
    : isDragAccept
    ? "border-green-400 bg-green-50 dark:bg-green-900/10"
    : isDragActive
    ? "border-primary bg-primary/5"
    : "border-border hover:border-primary/50 bg-background";

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`
          relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8
          text-center cursor-pointer transition-colors duration-200 outline-none
          focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
          ${borderColor}
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <input {...getInputProps()} />

        <Upload
          className={`mb-3 h-10 w-10 transition-colors ${
            isDragActive ? "text-primary" : "text-muted-foreground"
          }`}
          aria-hidden="true"
        />

        {isDragActive ? (
          <p className="text-sm font-medium text-primary">
            {isDragReject ? "Some files will be rejected" : "Drop files here…"}
          </p>
        ) : (
          <>
            <p className="text-sm font-medium">
              Drag &amp; drop files here, or{" "}
              <span className="text-primary underline underline-offset-2">browse</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPEG, PNG, PDF · Max {formatBytes(maxSize)} per file · Up to{" "}
              {maxFiles} file{maxFiles !== 1 ? "s" : ""}
            </p>
          </>
        )}

        {currentFiles.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {currentFiles.length}/{maxFiles} file{currentFiles.length !== 1 ? "s" : ""} selected
          </p>
        )}
      </div>

      {/* Rejection errors */}
      {fileRejections.length > 0 && (
        <ul className="space-y-1">
          {fileRejections.map(({ file, errors }) => (
            <li
              key={file.name}
              className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span>
                <span className="font-medium">{file.name}</span>
                {" — "}
                {errors.map((e) => {
                  if (e.code === "file-too-large") return `Too large (max ${formatBytes(maxSize)})`;
                  if (e.code === "file-invalid-type") return "Invalid file type";
                  if (e.code === "too-many-files") return "Too many files";
                  return e.message;
                }).join(", ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
