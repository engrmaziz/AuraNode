"use client";

interface RiskScoreDisplayProps {
  riskScore: number;
  flaggedStatus: boolean;
  detectedCategory: string;
}

interface RiskLevel {
  label: string;
  color: string;
  trackColor: string;
  textColor: string;
  bgColor: string;
}

function getRiskLevel(score: number): RiskLevel {
  if (score >= 0.8) {
    return {
      label: "Critical",
      color: "#ef4444",
      trackColor: "#fee2e2",
      textColor: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
    };
  }
  if (score >= 0.6) {
    return {
      label: "High Risk",
      color: "#f97316",
      trackColor: "#ffedd5",
      textColor: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800",
    };
  }
  if (score >= 0.3) {
    return {
      label: "Moderate Risk",
      color: "#eab308",
      trackColor: "#fef9c3",
      textColor: "text-yellow-600 dark:text-yellow-400",
      bgColor: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800",
    };
  }
  return {
    label: "Low Risk",
    color: "#22c55e",
    trackColor: "#dcfce7",
    textColor: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
  };
}

/**
 * Circular SVG gauge displaying a risk score (0–1) with color coding.
 * Pulses when flaggedStatus is true.
 */
export function RiskScoreDisplay({
  riskScore,
  flaggedStatus,
  detectedCategory,
}: RiskScoreDisplayProps) {
  const clampedScore = Math.min(Math.max(riskScore ?? 0, 0), 1);
  const level = getRiskLevel(clampedScore);
  const percentage = Math.round(clampedScore * 100);

  // SVG arc parameters
  const radius = 54;
  const cx = 70;
  const cy = 70;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  // We draw a 270° arc (three-quarters of the circle), starting from the bottom-left
  const arcLength = circumference * 0.75;
  const fillLength = arcLength * clampedScore;
  const gapLength = arcLength - fillLength;
  // The remaining 90° gap sits at the bottom centre (open arc gauge look)
  const dashArray = `${fillLength} ${gapLength + circumference * 0.25}`;
  // Rotate so the arc starts at ~225° (bottom-left)
  const rotation = 135;

  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-xl border p-5 ${level.bgColor} ${
        flaggedStatus ? "animate-pulse" : ""
      }`}
      aria-label={`Risk score: ${percentage}% — ${level.label}`}
    >
      {/* SVG gauge */}
      <div className="relative">
        <svg
          width="140"
          height="140"
          viewBox="0 0 140 140"
          aria-hidden="true"
          className="drop-shadow-sm"
        >
          {/* Track (background arc) */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={level.trackColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference - arcLength}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(${rotation} ${cx} ${cy})`}
          />
          {/* Value arc */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={level.color}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            strokeDashoffset={0}
            strokeLinecap="round"
            transform={`rotate(${rotation} ${cx} ${cy})`}
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>

        {/* Centre text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`text-3xl font-bold leading-none tabular-nums ${level.textColor}`}
          >
            {percentage}%
          </span>
          <span className={`mt-1 text-xs font-semibold uppercase tracking-wide ${level.textColor}`}>
            {level.label}
          </span>
        </div>
      </div>

      {/* Detected category */}
      <p className={`text-sm font-medium text-center ${level.textColor}`}>
        {detectedCategory ?? "—"}
      </p>
    </div>
  );
}
