"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface ExtractedTextViewerProps {
  text: string;
  confidence: number; // 0.0 – 1.0
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);

  let colorClass: string;
  let label: string;

  if (pct >= 75) {
    colorClass =
      "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
    label = "High confidence";
  } else if (pct >= 50) {
    colorClass =
      "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800";
    label = "Medium confidence";
  } else {
    colorClass =
      "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
    label = "Low confidence";
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
      title={label}
    >
      {pct}% confidence
    </span>
  );
}

export function ExtractedTextViewer({ text, confidence }: ExtractedTextViewerProps) {
  const [copied, setCopied] = useState(false);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available — silently ignore
    }
  };

  return (
    <div className="rounded-xl border border-border bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Extracted Text</h3>
          <ConfidenceBadge confidence={confidence} />
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{wordCount.toLocaleString()} words</span>
          <span>{charCount.toLocaleString()} chars</span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-green-500" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {text.trim() ? (
        <pre className="overflow-auto max-h-96 whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-foreground">
          {text}
        </pre>
      ) : (
        <div className="py-12 text-center text-muted-foreground text-sm">
          No text extracted from this file.
        </div>
      )}
    </div>
  );
}
