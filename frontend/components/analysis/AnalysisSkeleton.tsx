"use client";

/**
 * Loading skeleton that mimics the AIFindingsPanel layout.
 * Uses Tailwind animate-pulse for the shimmer effect.
 */
export function AnalysisSkeleton() {
  return (
    <div className="space-y-5 animate-pulse" aria-busy="true" aria-label="Loading AI analysis…">
      {/* Gauge + category skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Circular gauge placeholder */}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/30 p-5">
          <div className="h-[140px] w-[140px] rounded-full bg-muted" />
          <div className="h-4 w-28 rounded-full bg-muted" />
        </div>

        {/* Category + keyword placeholders */}
        <div className="space-y-4 pt-2">
          <div>
            <div className="mb-1.5 h-3 w-24 rounded-full bg-muted" />
            <div className="h-6 w-36 rounded-full bg-muted" />
          </div>
          <div>
            <div className="mb-1.5 h-3 w-28 rounded-full bg-muted" />
            <div className="flex gap-1.5">
              <div className="h-5 w-16 rounded-md bg-muted" />
              <div className="h-5 w-20 rounded-md bg-muted" />
              <div className="h-5 w-14 rounded-md bg-muted" />
            </div>
          </div>
        </div>
      </div>

      {/* Summary skeleton */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
        <div className="h-3 w-28 rounded-full bg-muted" />
        <div className="h-4 w-full rounded-full bg-muted" />
        <div className="h-4 w-4/5 rounded-full bg-muted" />
        <div className="h-4 w-3/5 rounded-full bg-muted" />
      </div>

      {/* Entities table skeleton */}
      <div>
        <div className="mb-2 h-3 w-36 rounded-full bg-muted" />
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Header */}
          <div className="flex gap-4 bg-muted/50 px-4 py-2">
            <div className="h-3 w-16 rounded-full bg-muted" />
            <div className="h-3 w-12 rounded-full bg-muted" />
            <div className="ml-auto h-3 w-16 rounded-full bg-muted" />
          </div>
          {/* Rows */}
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex gap-4 border-t border-border bg-white dark:bg-gray-900 px-4 py-2"
            >
              <div className="h-4 w-24 rounded-full bg-muted" />
              <div className="h-4 w-16 rounded-md bg-muted" />
              <div className="ml-auto h-4 w-10 rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </div>

      {/* Metadata skeleton */}
      <div className="flex gap-4 border-t border-border pt-3">
        <div className="h-3 w-24 rounded-full bg-muted" />
        <div className="h-3 w-28 rounded-full bg-muted" />
      </div>
    </div>
  );
}
